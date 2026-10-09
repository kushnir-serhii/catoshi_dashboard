/**
 * Acceptance tests for the Market Pulse (spec 027 functional §2.1, §2.2, §2.7;
 * technical §2.5).
 *
 * Run:  node --import tsx --test src/scripts/pulse.test.ts
 *
 * Pure functions only: no database, no network, no clock reads. Every input is a
 * fixture or built in this file. `@spec: 027-market-pulse` marks every test;
 * `@regression` marks the ones that pin a bug-prone boundary or a decision from
 * `context/spec/027-market-pulse/decisions.md`.
 *
 * Fixture: `src/scripts/fixtures/027-pulse-eth-2026-10-07T02.json` holds REAL
 * market-state rows: the stored 2026-10-07 02:00Z ETH snapshot replayed through the
 * current rule set (see `_meta`).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  PULSE_ALERT_DEDUPE_HOURS,
  PULSE_CATEGORY_CAP,
  PULSE_CONFLICT_MIN,
  PULSE_MIN_INPUTS,
  PULSE_REVERSAL_POINTS,
  PULSE_WEIGHTS,
} from '@/consts/pulse';
import {
  computePulse,
  missingCategories,
  type PulseInputRow,
  type PulseMacroInput,
  type PulseMarketStateInput,
  type PulseNewsInput,
  type PulseSeverityLevel,
  toPulseSeverity,
} from '@/lib/pulse/compute';
import { formatPulseAlert } from '@/lib/pulse/message';
import {
  decideNotifications,
  type PulseAlertDecision,
  type PulsePoint,
  pulsePointFromComputation,
  pulsePointFromStored,
  type SentAlert,
} from '@/lib/pulse/notify-decision';
import { buildPulseSummary } from '@/lib/pulse/summary';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const H = 3_600_000;
const NOW = new Date('2026-10-07T12:00:00Z');

/** Stored severities that land in each Pulse level (bounds 0.4 / 0.8). */
const SEV = { LOW: 0.2, MEDIUM: 0.5, HIGH: 0.9 } as const;

let nextId = 1000;
const newId = (): string => String(nextId++);

function ms(
  ruleId: string,
  tag: PulseInputRow['tag'],
  level: PulseSeverityLevel,
  over: Partial<PulseMarketStateInput> = {},
): PulseMarketStateInput {
  const id = newId();
  return {
    kind: 'market_state',
    id,
    asset: 'ETH',
    tag,
    severity: SEV[level],
    title: `${ruleId} ${id}`,
    body: 'No number here',
    ruleId,
    ...over,
  };
}

function macro(
  tag: PulseInputRow['tag'],
  level: PulseSeverityLevel,
  over: Partial<PulseMacroInput> = {},
): PulseMacroInput {
  const id = newId();
  return {
    kind: 'macro',
    id,
    asset: null,
    tag,
    severity: SEV[level],
    title: `Brent ${id}`,
    body: 'Brent up 4.1% on the week',
    ruleId: 'macro_brent',
    observedAt: NOW,
    ...over,
  };
}

function news(
  tag: PulseInputRow['tag'],
  level: PulseSeverityLevel,
  over: Partial<PulseNewsInput> = {},
): PulseNewsInput {
  const id = newId();
  return {
    kind: 'news',
    id,
    asset: null,
    tag,
    severity: SEV[level],
    title: `Headline ${id}`,
    body: 'Body',
    magnitude: level,
    horizonHours: 48,
    contentType: 'event',
    clusterId: null,
    publishedAt: NOW,
    ...over,
  };
}

/** Neutral rows: count toward `inputCount`, never move the bar. */
function fillers(n: number): PulseMarketStateInput[] {
  return Array.from({ length: n }, () => ms('ma_compression', 'NEUTRAL', 'LOW'));
}

function ok(result: ReturnType<typeof computePulse>): Extract<typeof result, { status: 'ok' }> {
  assert.equal(result.status, 'ok');
  return result as Extract<typeof result, { status: 'ok' }>;
}

function run(rows: readonly PulseInputRow[], scope: 'market' | 'BTC' | 'ETH' | 'SOL' = 'ETH') {
  return computePulse(scope, rows, [], NOW);
}

function near(actual: number, expected: number, tol = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} within ${tol} of ${expected}`);
}

/** Deterministic pseudo-random numbers in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const LEVELS: PulseSeverityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const TAGS: PulseInputRow['tag'][] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

/** One random row from the six categories. */
function randomRow(rand: () => number, forceTag?: PulseInputRow['tag']): PulseInputRow {
  const tag = forceTag ?? TAGS[Math.floor(rand() * TAGS.length)];
  const level = LEVELS[Math.floor(rand() * LEVELS.length)];
  switch (Math.floor(rand() * 6)) {
    case 0:
      return ms('etf_streak', tag, level);
    case 1:
      return ms('funding_extreme', tag, level);
    case 2:
      return ms('range_break', tag, level);
    case 3:
      return ms('fear_greed_extreme', tag, level);
    case 4:
      return macro(tag, level);
    default:
      return news(tag, level);
  }
}

// ---------------------------------------------------------------------------
// §2.1 / technical §2.5: computePulse
// ---------------------------------------------------------------------------

describe('computePulse: insufficient inputs', () => {
  // @spec: 027-market-pulse
  // @regression
  it('empty input is insufficient, never a zero value', () => {
    const result = run([]);
    assert.equal(result.status, 'insufficient');
    assert.equal(result.inputCount, 0);
    assert.equal('value' in result, false);
  });

  // @spec: 027-market-pulse
  // @regression
  it('fewer than PULSE_MIN_INPUTS is insufficient even when strongly directional', () => {
    const rows = Array.from({ length: PULSE_MIN_INPUTS - 1 }, () =>
      ms('etf_streak', 'BEARISH', 'HIGH'),
    );
    const result = run(rows);
    assert.equal(result.status, 'insufficient');
    assert.equal(result.inputCount, PULSE_MIN_INPUTS - 1);
    assert.equal('value' in result, false);
  });

  // @spec: 027-market-pulse
  it('exactly PULSE_MIN_INPUTS neutral rows is ok with value 0 (a real zero, not a missing one)', () => {
    const result = ok(run(fillers(PULSE_MIN_INPUTS)));
    assert.equal(result.value, 0);
    assert.equal(result.inputCount, PULSE_MIN_INPUTS);
    assert.equal(result.conflict, false);
  });

  // @spec: 027-market-pulse
  it('rows of another asset do not count toward the scope', () => {
    const rows = [
      ...fillers(PULSE_MIN_INPUTS - 1),
      ms('etf_streak', 'BEARISH', 'HIGH', { asset: 'BTC' }),
    ];
    assert.equal(run(rows, 'ETH').status, 'insufficient');
  });
});

describe('computePulse: monotonicity', () => {
  // @spec: 027-market-pulse
  // @regression
  it('adding a bearish row never raises value; adding a bullish row never lowers it', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rand = lcg(seed);
      const size = PULSE_MIN_INPUTS + Math.floor(rand() * 8);
      const base = Array.from({ length: size }, () => randomRow(rand));
      const before = ok(run(base));

      const withBear = ok(run([...base, randomRow(rand, 'BEARISH')]));
      assert.ok(
        withBear.value <= before.value,
        `seed ${seed}: bear ${before.value} -> ${withBear.value}`,
      );
      assert.ok(withBear.bearRaw >= before.bearRaw - 1e-12, `seed ${seed}: bearRaw fell`);
      near(withBear.bullRaw, before.bullRaw);

      const withBull = ok(run([...base, randomRow(rand, 'BULLISH')]));
      assert.ok(
        withBull.value >= before.value,
        `seed ${seed}: bull ${before.value} -> ${withBull.value}`,
      );
      assert.ok(withBull.bullRaw >= before.bullRaw - 1e-12, `seed ${seed}: bullRaw fell`);
    }
  });
});

describe('computePulse: category cap', () => {
  const bearishNews = (n: number): PulseNewsInput[] =>
    Array.from({ length: n }, () => news('BEARISH', 'HIGH'));

  // @spec: 027-market-pulse
  // @regression
  it('20 bearish HIGH news rows give at most PULSE_CATEGORY_CAP x W.news of raw', () => {
    const result = ok(run(bearishNews(20)));
    const limit = PULSE_CATEGORY_CAP * PULSE_WEIGHTS.news;
    assert.ok(result.bearRaw <= limit + 1e-9, `bearRaw ${result.bearRaw} > ${limit}`);
    near(result.bearRaw, limit);
    near(result.categories.news?.bear ?? -1, limit);
    assert.equal(result.bullRaw, 0);
  });

  // @spec: 027-market-pulse
  // @regression
  it('a 21st bearish row changes nothing but inputCount', () => {
    const twenty = ok(run(bearishNews(20)));
    const twentyOne = ok(run(bearishNews(21)));
    near(twentyOne.bearRaw, twenty.bearRaw);
    assert.equal(twentyOne.bear, twenty.bear);
    assert.equal(twentyOne.value, twenty.value);
    assert.equal(twenty.inputCount, 20);
    assert.equal(twentyOne.inputCount, 21);
  });

  // @spec: 027-market-pulse
  it('the drivers add up to the raw totals after the cap', () => {
    const result = ok(run([...bearishNews(20), ...fillers(2)]));
    const sum = result.drivers.reduce((acc, d) => acc - Math.min(d.c, 0), 0);
    // Only the top PULSE_DRIVER_COUNT are kept, so the sum is a lower bound.
    assert.ok(sum <= result.bearRaw + 1e-9);
    for (const d of result.drivers) assert.equal(d.category, 'news');
  });
});

describe('computePulse: news clusters', () => {
  // @spec: 027-market-pulse
  // @regression
  it('a cluster of 3 rows counts once; the driver signalId is the representative id', () => {
    const rep = news('BEARISH', 'MEDIUM', { clusterId: 'C1', severity: 0.8, id: '5002' });
    const rows = [
      news('BEARISH', 'MEDIUM', { clusterId: 'C1', severity: 0.5, id: '5001' }),
      rep,
      news('BEARISH', 'MEDIUM', { clusterId: 'C1', severity: 0.5, id: '5003' }),
      ...fillers(4),
    ];
    const result = ok(run(rows));
    assert.equal(result.inputCount, 5, '3 cluster members + 4 fillers collapse to 1 + 4');
    near(result.bearRaw, 0.65 * PULSE_WEIGHTS.news);
    const newsDrivers = result.drivers.filter((d) => d.category === 'news');
    assert.equal(newsDrivers.length, 1);
    assert.equal(newsDrivers[0].signalId, '5002');
  });

  // @spec: 027-market-pulse
  it('equal severity: the newest publishedAt, then the highest id, is the representative', () => {
    const older = news('BEARISH', 'MEDIUM', {
      clusterId: 'C2',
      id: '6009',
      publishedAt: new Date(NOW.getTime() - 2 * H),
    });
    const newer = news('BEARISH', 'MEDIUM', {
      clusterId: 'C2',
      id: '6001',
      publishedAt: new Date(NOW.getTime() - 1 * H),
    });
    const result = ok(run([older, newer, ...fillers(4)]));
    assert.equal(result.drivers.find((d) => d.category === 'news')?.signalId, '6001');
  });

  // @spec: 027-market-pulse
  it('an unclassified representative keeps the card id; a classified member supplies the values', () => {
    const card = news('BULLISH', 'HIGH', {
      clusterId: 'C3',
      id: '7002',
      severity: 0.9,
      contentType: null,
    });
    const member = news('BEARISH', 'MEDIUM', { clusterId: 'C3', id: '7001', severity: 0.5 });
    const result = ok(run([card, member, ...fillers(4)]));
    assert.equal(result.inputCount, 5);
    const driver = result.drivers.find((d) => d.category === 'news');
    assert.equal(driver?.signalId, '7002');
    assert.equal(driver?.sign, -1, 'sign comes from the classified member');
  });
});

describe('computePulse: Conflict', () => {
  /** One side built from known category levels. See the arithmetic in each test. */
  function side(
    tag: 'BULLISH' | 'BEARISH',
    levels: {
      flows: PulseSeverityLevel;
      derivatives: PulseSeverityLevel;
      technical: PulseSeverityLevel;
    },
  ): PulseMarketStateInput[] {
    return [
      ms('etf_streak', tag, levels.flows),
      ms('funding_extreme', tag, levels.derivatives),
      ms('range_break', tag, levels.technical),
    ];
  }
  // index 50: flows HIGH 1.2 + derivatives MEDIUM 0.65 + technical LOW 0.21 = 2.06 raw
  //           round(100 * (1 - exp(-2.06 / 3))) = 50
  const AT_MIN = { flows: 'HIGH', derivatives: 'MEDIUM', technical: 'LOW' } as const;
  // index 49: flows MEDIUM 0.78 + derivatives MEDIUM 0.65 + technical HIGH 0.6 = 2.03 raw
  //           round(100 * (1 - exp(-2.03 / 3))) = 49
  const BELOW_MIN = { flows: 'MEDIUM', derivatives: 'MEDIUM', technical: 'HIGH' } as const;

  // @spec: 027-market-pulse
  // @regression
  it('both indices exactly at PULSE_CONFLICT_MIN (50 / 50) is a Conflict', () => {
    assert.equal(PULSE_CONFLICT_MIN, 50, 'the boundary rows below are built for 50');
    const result = ok(run([...side('BULLISH', AT_MIN), ...side('BEARISH', AT_MIN)]));
    assert.equal(result.bull, 50);
    assert.equal(result.bear, 50);
    assert.equal(result.conflict, true);
  });

  // @spec: 027-market-pulse
  // @regression
  it('one index at 49 is not a Conflict, on either side', () => {
    const bullShort = ok(run([...side('BULLISH', BELOW_MIN), ...side('BEARISH', AT_MIN)]));
    assert.equal(bullShort.bull, 49);
    assert.equal(bullShort.bear, 50);
    assert.equal(bullShort.conflict, false);

    const bearShort = ok(run([...side('BULLISH', AT_MIN), ...side('BEARISH', BELOW_MIN)]));
    assert.equal(bearShort.bull, 50);
    assert.equal(bearShort.bear, 49);
    assert.equal(bearShort.conflict, false);
  });

  // @spec: 027-market-pulse
  // @regression
  it('one MEDIUM bullish against one MEDIUM bearish gives 19 / 19 and no Conflict', () => {
    const rows = [
      ms('funding_extreme', 'BULLISH', 'MEDIUM'),
      ms('funding_extreme', 'BEARISH', 'MEDIUM'),
      ...fillers(3),
    ];
    const result = ok(run(rows));
    assert.equal(result.bull, 19);
    assert.equal(result.bear, 19);
    assert.equal(result.value, 0);
    assert.equal(result.conflict, false);
  });

  // @spec: 027-market-pulse
  // @regression
  it('four MEDIUM per side across flows, derivatives, macro and news gives 58 / 58 and a Conflict', () => {
    const fourMedium = (tag: 'BULLISH' | 'BEARISH'): PulseInputRow[] => [
      ms('etf_streak', tag, 'MEDIUM'),
      ms('funding_extreme', tag, 'MEDIUM'),
      macro(tag, 'MEDIUM'),
      news(tag, 'MEDIUM'),
    ];
    const result = ok(run([...fourMedium('BULLISH'), ...fourMedium('BEARISH')]));
    assert.equal(result.bull, 58);
    assert.equal(result.bear, 58);
    assert.equal(result.conflict, true);
    assert.match(result.summary, /^Conflicted:/);
  });
});

describe('computePulse: opinion and unclassified news', () => {
  const base = (): PulseInputRow[] => [
    ms('etf_streak', 'BULLISH', 'MEDIUM'),
    ms('funding_extreme', 'BEARISH', 'MEDIUM'),
    ...fillers(3),
  ];

  // @spec: 027-market-pulse
  // @regression
  it('an opinion row (weight 0) leaves value unchanged but still counts toward inputCount', () => {
    const without = ok(run(base()));
    const withOpinion = ok(run([...base(), news('BEARISH', 'HIGH', { contentType: 'opinion' })]));
    assert.equal(withOpinion.value, without.value);
    assert.equal(withOpinion.bear, without.bear);
    near(withOpinion.bearRaw, without.bearRaw);
    assert.equal(withOpinion.inputCount, without.inputCount + 1);
    assert.equal(
      withOpinion.drivers.some((d) => d.category === 'news'),
      false,
    );

    const withEvent = ok(run([...base(), news('BEARISH', 'HIGH', { contentType: 'event' })]));
    assert.ok(withEvent.value < without.value, 'the same row as an event does move the bar');
  });

  // @spec: 027-market-pulse
  it('an opinion row can lift a thin set over PULSE_MIN_INPUTS without moving the bar', () => {
    const four = base().slice(0, PULSE_MIN_INPUTS - 1);
    assert.equal(run(four).status, 'insufficient');
    const result = ok(run([...four, news('BEARISH', 'HIGH', { contentType: 'opinion' })]));
    assert.equal(result.inputCount, PULSE_MIN_INPUTS);
    assert.equal(result.bearRaw, ok(run(base())).bearRaw);
  });

  // @spec: 027-market-pulse
  // @regression
  it('news with contentType null is excluded from value and from inputCount', () => {
    const without = ok(run(base()));
    const withNull = ok(run([...base(), news('BEARISH', 'HIGH', { contentType: null })]));
    assert.equal(withNull.value, without.value);
    near(withNull.bearRaw, without.bearRaw);
    assert.equal(withNull.inputCount, without.inputCount);
  });

  // @spec: 027-market-pulse
  // @regression
  it('null-contentType news does not rescue a set below PULSE_MIN_INPUTS', () => {
    const rows = [
      ...base().slice(0, PULSE_MIN_INPUTS - 1),
      news('BEARISH', 'HIGH', { contentType: null }),
    ];
    const result = run(rows);
    assert.equal(result.status, 'insufficient');
    assert.equal(result.inputCount, PULSE_MIN_INPUTS - 1);
  });
});

describe('computePulse: macro rows reach the Pulse', () => {
  // @spec: 027-market-pulse
  // @regression
  for (const scope of ['market', 'ETH'] as const) {
    it(`a kind 'macro' row with asset null reaches the ${scope} Pulse as a macro driver`, () => {
      const row = macro('BEARISH', 'HIGH', { id: '9001' });
      const result = ok(run([row, ...fillers(4)], scope));
      assert.equal(result.inputCount, 5);
      near(result.categories.macro?.bear ?? 0, 1.0 * PULSE_WEIGHTS.macro);
      near(result.bearRaw, PULSE_WEIGHTS.macro);
      const driver = result.drivers.find((d) => d.signalId === '9001');
      assert.ok(driver, 'the macro row is among the drivers');
      assert.equal(driver.category, 'macro');
      assert.equal(driver.sign, -1);
      assert.equal(driver.display, '4.1%');
    });
  }

  // @spec: 027-market-pulse
  it('macro decay uses the observation age (72h scale), not the row creation time', () => {
    const at = (hoursAgo: number): number => {
      const row = macro('BEARISH', 'HIGH', { observedAt: new Date(NOW.getTime() - hoursAgo * H) });
      return ok(run([row, ...fillers(4)])).bearRaw;
    };
    near(at(0), 1.0);
    near(at(72), Math.exp(-1));
    near(at(168), Math.exp(-168 / 72));
    // A date-only observation string works too.
    const iso = macro('BEARISH', 'HIGH', { observedAt: '2026-10-04T12:00:00Z' });
    near(ok(run([iso, ...fillers(4)])).bearRaw, Math.exp(-1));
  });

  // @spec: 027-market-pulse
  it('a macro row is not halved in scope market (asset rows are)', () => {
    const rows = [macro('BEARISH', 'HIGH'), ms('etf_streak', 'BEARISH', 'HIGH'), ...fillers(3)];
    const market = ok(run(rows, 'market'));
    near(market.categories.macro?.bear ?? 0, 1.0);
    near(market.categories.flows?.bear ?? 0, 0.5 * PULSE_WEIGHTS.flows);
  });
});

describe('toPulseSeverity', () => {
  // @spec: 027-market-pulse
  it('buckets stored severities at 0.4 / 0.8 for market-state and at the magnitude midpoints for news', () => {
    assert.equal(toPulseSeverity(ms('etf_streak', 'BEARISH', 'LOW', { severity: 0.39 })), 'LOW');
    assert.equal(toPulseSeverity(ms('etf_streak', 'BEARISH', 'LOW', { severity: 0.4 })), 'MEDIUM');
    assert.equal(toPulseSeverity(ms('etf_streak', 'BEARISH', 'LOW', { severity: 0.8 })), 'HIGH');
    assert.equal(
      toPulseSeverity(news('BEARISH', 'LOW', { magnitude: 'HIGH', severity: 0.1 })),
      'HIGH',
    );
    assert.equal(
      toPulseSeverity(news('BEARISH', 'LOW', { magnitude: null, severity: 0.5 })),
      'MEDIUM',
    );
  });
});

// ---------------------------------------------------------------------------
// §2.2: missing
// ---------------------------------------------------------------------------

describe('missing categories', () => {
  const okSrc = (source: string) => ({ source, ok: true });
  const bad = (source: string) => ({ source, ok: false });

  // @spec: 027-market-pulse
  it('all macro collectors failing lists "macro"', () => {
    assert.deepEqual(missingCategories('ETH', [bad('macro')]), ['macro']);
    const result = computePulse('ETH', fillers(5), [bad('macro')], NOW);
    assert.deepEqual(ok(result).missing, ['macro']);
  });

  // @spec: 027-market-pulse
  it('one of 3 news feeds failing lists "news (2/3 feeds)"', () => {
    const statuses = [bad('news:coindesk'), okSrc('news:cointelegraph'), okSrc('news:decrypt')];
    assert.deepEqual(missingCategories('market', statuses), ['news (2/3 feeds)']);
  });

  // @spec: 027-market-pulse
  it('all 3 news feeds failing lists plain "news"', () => {
    const statuses = [bad('news:coindesk'), bad('news:cointelegraph'), bad('news:decrypt')];
    assert.deepEqual(missingCategories('market', statuses), ['news']);
  });

  // @spec: 027-market-pulse
  // @regression
  it('SOL has no etfFlows and is not counted: flows is missing only when BTC and ETH both fail', () => {
    // Scope SOL: no SOL:etfFlows status at all, other SOL sources healthy.
    assert.deepEqual(missingCategories('SOL', [okSrc('SOL:funding'), okSrc('SOL:klines')]), []);
    // Scope market: BTC healthy, ETH failing -> not missing.
    assert.deepEqual(
      missingCategories('market', [
        okSrc('BTC:etfFlows'),
        bad('ETH:etfFlows'),
        okSrc('SOL:funding'),
      ]),
      [],
    );
    // Both ETF assets failing -> missing, SOL's absence does not hide it.
    assert.deepEqual(
      missingCategories('market', [bad('BTC:etfFlows'), bad('ETH:etfFlows'), okSrc('SOL:funding')]),
      ['flows'],
    );
  });

  // @spec: 027-market-pulse
  it('a source with no status row is unknown, not failing', () => {
    assert.deepEqual(missingCategories('ETH', []), []);
  });
});

// ---------------------------------------------------------------------------
// Golden case: 2026-10-07
// ---------------------------------------------------------------------------

interface PulseFixture {
  _meta: { computedAt: string; note: string };
  rows: PulseInputRow[];
}

function loadFixture(name: string): PulseFixture {
  const path = join(process.cwd(), 'src', 'scripts', 'fixtures', name);
  return JSON.parse(readFileSync(path, 'utf8')) as PulseFixture;
}

describe('golden case: 2026-10-07 ETH', () => {
  // @spec: 027-market-pulse
  // @regression
  // THE golden case (technical §2.5): the hour of the actual drop (ETH 2693 -> 2599
  // at the 02:00Z snapshot), stored snapshots replayed through the current rule set.
  it('02:00Z set (the drop hour) gives value < -20 or conflict (technical §2.5)', () => {
    const fixture = loadFixture('027-pulse-eth-2026-10-07T02.json');
    const result = ok(computePulse('ETH', fixture.rows, [], new Date(fixture._meta.computedAt)));
    assert.ok(
      result.value < -20 || result.conflict,
      `value ${result.value}, conflict ${result.conflict}`,
    );
    assert.equal(result.inputCount, fixture.rows.length);
    assert.match(result.summary, /^Bearish:/);
    const ids = result.drivers.map((d) => d.signalId);
    assert.ok(
      ids.some((id) => id.includes('long_flush')),
      'long_flush is a driver',
    );
  });
});

describe('buildPulseSummary', () => {
  // @spec: 027-market-pulse
  it('says so when no driver has a direction', () => {
    assert.equal(
      buildPulseSummary([], 0, false),
      'No directional pressure: live signals are neutral.',
    );
  });

  // @spec: 027-market-pulse
  it('names the leading side first and keeps one sentence under the budget', () => {
    const line = buildPulseSummary(
      [
        { label: 'ETH ETF outflows', sign: -1 },
        { label: 'BTC leaving exchanges', sign: 1 },
      ],
      -30,
      false,
    );
    assert.equal(line, 'Bearish: ETH ETF outflows; counterweight: BTC leaving exchanges.');
  });
});

// ---------------------------------------------------------------------------
// §2.7: notifications
// ---------------------------------------------------------------------------

const T0 = new Date('2026-10-08T12:00:00Z');
const ago = (hours: number): Date => new Date(T0.getTime() - hours * H);

function point(computedAt: Date, over: Partial<PulsePoint> = {}): PulsePoint {
  return {
    scope: 'ETH',
    computedAt,
    bull: 10,
    bear: 10,
    value: 0,
    conflict: false,
    bearCategories: null,
    bullCategories: null,
    drivers: [],
    ...over,
  };
}

const BEAR_CONFLUENCE = { bear: 65, bull: 0, value: -65, bearCategories: 4 } as const;
const sent = (hoursAgo: number, over: Partial<SentAlert> = {}): SentAlert => ({
  scope: 'ETH',
  type: 'bear_confluence',
  sentAt: ago(hoursAgo),
  ...over,
});
const types = (decisions: readonly PulseAlertDecision[]): string[] => decisions.map((d) => d.type);

describe('decideNotifications: dedupe', () => {
  const current = point(T0, BEAR_CONFLUENCE);

  // @spec: 027-market-pulse
  it('a bear confluence fires once when nothing was sent', () => {
    assert.deepEqual(types(decideNotifications([current], [], T0)), ['bear_confluence']);
  });

  // @spec: 027-market-pulse
  // @regression
  it('is suppressed when the same (scope, type) was sent within 24h', () => {
    for (const hoursAgo of [1, 5, 12, 23.99]) {
      assert.deepEqual(
        decideNotifications([current], [sent(hoursAgo)], T0),
        [],
        `sent ${hoursAgo}h ago must suppress`,
      );
    }
  });

  // @spec: 027-market-pulse
  // @regression
  it('fires again at exactly PULSE_ALERT_DEDUPE_HOURS after the triggering point', () => {
    assert.equal(PULSE_ALERT_DEDUPE_HOURS, 24);
    assert.deepEqual(types(decideNotifications([current], [sent(24)], T0)), ['bear_confluence']);
    assert.deepEqual(types(decideNotifications([current], [sent(30)], T0)), ['bear_confluence']);
  });

  // @spec: 027-market-pulse
  it('another scope or another type does not suppress; a future entry is ignored', () => {
    assert.deepEqual(types(decideNotifications([current], [sent(1, { scope: 'BTC' })], T0)), [
      'bear_confluence',
    ]);
    assert.deepEqual(types(decideNotifications([current], [sent(1, { type: 'conflict' })], T0)), [
      'bear_confluence',
    ]);
    assert.deepEqual(
      types(decideNotifications([current], [sent(-1)], T0)),
      ['bear_confluence'],
      'sentAt after now is look-ahead',
    );
  });

  // @spec: 027-market-pulse
  it('needs bear >= 60 and >= 4 categories; unknown categories never fire', () => {
    assert.deepEqual(
      decideNotifications([point(T0, { ...BEAR_CONFLUENCE, bear: 59 })], [], T0),
      [],
    );
    assert.deepEqual(
      decideNotifications([point(T0, { ...BEAR_CONFLUENCE, bearCategories: 3 })], [], T0),
      [],
    );
    assert.deepEqual(
      decideNotifications([point(T0, { ...BEAR_CONFLUENCE, bearCategories: null })], [], T0),
      [],
    );
  });

  // @spec: 027-market-pulse
  it('only the point computed at now is decided; a scope without one gets nothing', () => {
    const stale = point(ago(1), { ...BEAR_CONFLUENCE, scope: 'BTC' });
    assert.deepEqual(
      decideNotifications([current, stale], [], T0).map((d) => d.scope),
      ['ETH'],
    );
  });
});

describe('decideNotifications: Conflict', () => {
  const inConflict = { bull: 55, bear: 55, value: 0, conflict: true } as const;

  // @spec: 027-market-pulse
  // @regression
  it('fires on enter (previous point not Conflict) and not on stay', () => {
    const enter = [point(ago(1)), point(T0, inConflict)];
    assert.deepEqual(types(decideNotifications(enter, [], T0)), ['conflict']);

    const stay = [point(ago(1), inConflict), point(T0, inConflict)];
    assert.deepEqual(decideNotifications(stay, [], T0), []);
  });

  // @spec: 027-market-pulse
  // @regression
  it('does not declare an enter after a gap > 3h, or without a previous point', () => {
    assert.deepEqual(decideNotifications([point(ago(4)), point(T0, inConflict)], [], T0), []);
    assert.deepEqual(decideNotifications([point(T0, inConflict)], [], T0), []);
    // Exactly at the allowed gap it still counts as a baseline.
    assert.deepEqual(types(decideNotifications([point(ago(3)), point(T0, inConflict)], [], T0)), [
      'conflict',
    ]);
  });
});

describe('decideNotifications: reversal', () => {
  // @spec: 027-market-pulse
  // @regression
  it('a move of exactly PULSE_REVERSAL_POINTS fires; one point less does not', () => {
    assert.equal(PULSE_REVERSAL_POINTS, 40);
    const run24 = (before: number, now: number): string[] =>
      types(
        decideNotifications([point(ago(24), { value: before }), point(T0, { value: now })], [], T0),
      );
    assert.deepEqual(run24(0, 40), ['reversal']);
    assert.deepEqual(run24(0, 39), []);
    assert.deepEqual(run24(0, -40), ['reversal']);
    assert.deepEqual(run24(0, -39), []);
    assert.deepEqual(run24(-30, 10), ['reversal']);
  });

  // @spec: 027-market-pulse
  // @regression
  it('compares against the point nearest t-24h within +-2h, and nothing outside it', () => {
    const cur = point(T0, { value: 40 });
    // 25h (1h off) and 23.5h (0.5h off): the nearer one (value 30) is the baseline.
    const nearer = [point(ago(25), { value: 0 }), point(ago(23.5), { value: 30 }), cur];
    assert.deepEqual(decideNotifications(nearer, [], T0), []);
    // 26h is exactly at the tolerance and still used.
    assert.deepEqual(types(decideNotifications([point(ago(26), { value: 0 }), cur], [], T0)), [
      'reversal',
    ]);
    // 26.5h is outside it.
    assert.deepEqual(decideNotifications([point(ago(26.5), { value: 0 }), cur], [], T0), []);
  });
});

describe('Pulse points', () => {
  // @spec: 027-market-pulse
  it('an insufficient computation has no point', () => {
    assert.equal(pulsePointFromComputation('ETH', T0, run([])), null);
  });

  // @spec: 027-market-pulse
  // @regression
  it('four bearish categories from computePulse fire bear_confluence; a stored point never does', () => {
    const rows = [
      ms('etf_streak', 'BEARISH', 'HIGH'),
      ms('funding_extreme', 'BEARISH', 'HIGH'),
      macro('BEARISH', 'HIGH'),
      news('BEARISH', 'HIGH'),
      ...fillers(1),
    ];
    const computed = run(rows);
    const current = pulsePointFromComputation('ETH', T0, computed);
    assert.ok(current);
    assert.equal(current.bearCategories, 4);
    assert.equal(current.bullCategories, 0);
    assert.ok(current.bear >= 60);
    assert.deepEqual(types(decideNotifications([current], [], T0)), ['bear_confluence']);

    const stored = pulsePointFromStored({
      scope: 'ETH',
      computedAt: T0,
      bull: current.bull,
      bear: current.bear,
      value: current.value,
      conflict: current.conflict,
      inputCount: 5,
      drivers: [],
      missing: [],
      modelVersion: 1,
    });
    assert.equal(stored.bearCategories, null);
    assert.deepEqual(decideNotifications([stored], [], T0), []);
  });
});

// ---------------------------------------------------------------------------
// §2.7: message
// ---------------------------------------------------------------------------

describe('formatPulseAlert', () => {
  const decision: PulseAlertDecision = {
    scope: 'ETH',
    type: 'bear_confluence',
    reason: 'bear 74 >= 60 across 4 categories',
    point: point(T0, {
      bull: 5,
      bear: 74,
      value: -69,
      bearCategories: 4,
      drivers: [
        { signalId: '1', label: 'Funding <extreme> & flush', display: '-3.4%', c: -1 },
        { signalId: '2', label: 'Long crowding', display: '3.28', c: -0.8 },
      ],
    }),
  };
  const strip = (html: string): string => html.replace(/<[^>]+>/g, '');

  // @spec: 027-market-pulse
  // @regression
  it('Verdict B starts with "Unvalidated (backtest n = <n>)"; Verdict A does not', () => {
    const b = formatPulseAlert(decision, 'B', 7, 'https://catoshi.example');
    assert.ok(strip(b.split('\n')[0]).startsWith('Unvalidated (backtest n = 7)'));
    assert.ok(strip(b).startsWith('Unvalidated (backtest n = 7)'));
    const a = formatPulseAlert(decision, 'A', 7, 'https://catoshi.example');
    assert.equal(a.includes('Unvalidated'), false);
  });

  // @spec: 027-market-pulse
  // @regression
  it('escapes HTML special characters in labels and the reason', () => {
    const html = formatPulseAlert(
      { ...decision, reason: 'a < b & c > d' },
      'B',
      7,
      'https://catoshi.example',
    );
    assert.ok(html.includes('Funding &lt;extreme&gt; &amp; flush'));
    assert.equal(html.includes('<extreme>'), false);
    assert.ok(html.includes('a &lt; b &amp; c &gt; d'));
  });

  // @spec: 027-market-pulse
  it('carries the /signals link with exactly one slash before it, and the bar value', () => {
    const html = formatPulseAlert(decision, 'B', 7, 'https://catoshi.example/');
    assert.ok(html.includes('<a href="https://catoshi.example/signals">'));
    assert.equal(html.includes('//signals'), false);
    assert.ok(html.includes('Pulse −69 (Bearish)'));
    assert.ok(html.includes('bull 5 / bear 74'));
  });
});
