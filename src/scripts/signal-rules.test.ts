/**
 * Rule tests for spec 014 (functional-spec 2.6, technical-considerations §7).
 *
 * Run:  npx tsx src/scripts/signal-rules.test.ts
 *
 * No database, no network, no test runner — rules are pure functions, so plain
 * fixtures and assertions are enough. Exits non-zero on failure.
 *
 * Four cases per rule, as the spec requires: condition clearly met, clearly not
 * met, exactly at the threshold, and inputs missing. The boundary case matters
 * most — `>= 70` and `> 70` differ on precisely the reading most likely to
 * occur, and nothing else in the codebase would catch a flipped comparison.
 *
 * On top of those, §"Invariants" runs every registered rule against an
 * all-null snapshot. That is the null-discipline guard from functional-spec
 * 2.6: it fails for any rule — including one added later — that substitutes a
 * default for a missing reading. A rule that answers "funding flipped negative"
 * because Binance timed out is not a crash; it is the feed confidently telling
 * the user something untrue, and this is the test that stops it.
 */

import {
  ATR_EXPANSION_PCT,
  ETF_STREAK_DAYS,
  FEAR_GREED_FEAR,
  FEAR_GREED_GREED,
  FUNDING_EXTREME_RATE,
  FUNDING_FLIP_MIN_RATE,
  LONG_SHORT_LONG_HEAVY,
  LONG_SHORT_SHORT_HEAVY,
  MA99_STRETCH_PCT,
  MA_COMPRESSION_PCT,
  OI_SURGE_CHANGE_PCT,
  OI_SURGE_PRICE_FLAT_PCT,
  RSI_MIDLINE,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  SENTIMENT_SWING_POINTS,
  VOLUME_SPIKE_Z,
} from '@/consts/signals';
import type { MarketSnapshot } from '@/data/types';
import { RULES, RULES_BY_ID } from '@/lib/signals/rules';
import type { Signal } from '@/lib/signals/types';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Every produced signal, collected for the cross-cutting invariant checks. */
const produced: { ruleId: string; signal: Signal }[] = [];

/**
 * A snapshot with every nullable field null. Overrides fill in only what the
 * rule under test needs, so a rule reading a field the fixture never set is
 * reading `null` — which is the point.
 */
function snap(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    assetId: 1,
    ts: '2026-09-01T12:00:00.000Z',
    price: 100,
    marketCapUsd: null,
    volume24hUsd: null,
    rsi15m: null,
    rsi1h: null,
    rsi4h: null,
    rsi1d: null,
    ma715m: null,
    ma2515m: null,
    ma9915m: null,
    atr15m: null,
    volumeZ15m: null,
    structure15m: null,
    ma71h: null,
    ma251h: null,
    ma991h: null,
    atr1h: null,
    volumeZ1h: null,
    structure1h: null,
    ma74h: null,
    ma254h: null,
    ma994h: null,
    atr4h: null,
    volumeZ4h: null,
    structure4h: null,
    ma7Daily: null,
    ma25Daily: null,
    ma99Daily: null,
    pctFromMa7Daily: null,
    pctFromMa25Daily: null,
    pctFromMa99Daily: null,
    atrDaily: null,
    volumeZDaily: null,
    structureDaily: null,
    fundingRate: null,
    fundingRateDelta24h: null,
    openInterestUsd: null,
    openInterestChange24hPct: null,
    longShortRatio: null,
    liquidations24hUsd: null,
    liquidationsDominantSide: null,
    etfNetFlowUsd: null,
    etfStreakDays: null,
    etfFlow7dUsd: null,
    fearGreed: null,
    fearGreed7dAgo: null,
    raw: {},
    ...overrides,
  };
}

/** Runs one rule by id and records anything it produced. */
function run(
  ruleId: string,
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null = null,
): Signal | null {
  const definition = RULES_BY_ID[ruleId];
  if (!definition) {
    check(`${ruleId} is registered`, false, 'not found in RULES_BY_ID');
    return null;
  }
  const signal = definition.run(snapshot, previous);
  if (signal) {
    produced.push({ ruleId, signal });
  }
  return signal;
}

/** Asserts the standard quartet for a rule in one call. */
function quartet(
  ruleId: string,
  cases: {
    fires: { snapshot: MarketSnapshot; previous?: MarketSnapshot | null; tag?: Signal['tag'] };
    quiet: { snapshot: MarketSnapshot; previous?: MarketSnapshot | null };
    boundary: { snapshot: MarketSnapshot; previous?: MarketSnapshot | null; shouldFire: boolean };
  },
): void {
  const fired = run(ruleId, cases.fires.snapshot, cases.fires.previous ?? null);
  check(`${ruleId}: fires when the condition is met`, fired !== null);
  if (fired && cases.fires.tag) {
    check(`${ruleId}: tag is ${cases.fires.tag}`, fired.tag === cases.fires.tag, `got ${fired.tag}`);
  }
  if (fired) {
    check(`${ruleId}: signal carries its own ruleId`, fired.ruleId === ruleId, `got ${fired.ruleId}`);
  }

  const quiet = run(ruleId, cases.quiet.snapshot, cases.quiet.previous ?? null);
  check(`${ruleId}: stays quiet when the condition is not met`, quiet === null);

  const boundary = run(ruleId, cases.boundary.snapshot, cases.boundary.previous ?? null);
  check(
    `${ruleId}: exactly at the threshold ${cases.boundary.shouldFire ? 'fires' : 'stays quiet'}`,
    cases.boundary.shouldFire ? boundary !== null : boundary === null,
  );
}

// ---------------------------------------------------------------------------
section('RSI');
// ---------------------------------------------------------------------------

quartet('rsi_1d_overbought', {
  fires: { snapshot: snap({ rsi1d: 82 }), tag: 'BEARISH' },
  quiet: { snapshot: snap({ rsi1d: 55 }) },
  boundary: { snapshot: snap({ rsi1d: RSI_OVERBOUGHT }), shouldFire: true },
});
check(
  'rsi_1d_overbought: one point below the threshold stays quiet',
  run('rsi_1d_overbought', snap({ rsi1d: RSI_OVERBOUGHT - 1 })) === null,
);
{
  const mild = run('rsi_1d_overbought', snap({ rsi1d: 71 }));
  const extreme = run('rsi_1d_overbought', snap({ rsi1d: 88 }));
  check(
    'rsi_1d_overbought: RSI 88 outranks RSI 71 by severity',
    mild !== null && extreme !== null && extreme.severity > mild.severity,
    `${mild?.severity.toFixed(2)} vs ${extreme?.severity.toFixed(2)}`,
  );
}

quartet('rsi_1d_oversold', {
  fires: { snapshot: snap({ rsi1d: 18 }), tag: 'BULLISH' },
  quiet: { snapshot: snap({ rsi1d: 45 }) },
  boundary: { snapshot: snap({ rsi1d: RSI_OVERSOLD }), shouldFire: true },
});
check(
  'rsi_1d_oversold: one point above the threshold stays quiet',
  run('rsi_1d_oversold', snap({ rsi1d: RSI_OVERSOLD + 1 })) === null,
);

quartet('rsi_divergence_4h_1d', {
  fires: { snapshot: snap({ rsi4h: 62, rsi1d: 38 }), tag: 'NEUTRAL' },
  quiet: { snapshot: snap({ rsi4h: 62, rsi1d: 71 }) },
  // Exactly on the midline sits on neither side — documented as not firing.
  boundary: { snapshot: snap({ rsi4h: RSI_MIDLINE, rsi1d: 30 }), shouldFire: false },
});
check(
  'rsi_divergence_4h_1d: needs both timeframes, not just one',
  run('rsi_divergence_4h_1d', snap({ rsi4h: 62 })) === null &&
    run('rsi_divergence_4h_1d', snap({ rsi1d: 38 })) === null,
);

// ---------------------------------------------------------------------------
section('Funding');
// ---------------------------------------------------------------------------

quartet('funding_flip', {
  fires: {
    snapshot: snap({ fundingRate: 0.0004 }),
    previous: snap({ fundingRate: -0.0004 }),
    tag: 'BULLISH',
  },
  quiet: { snapshot: snap({ fundingRate: 0.0004 }), previous: snap({ fundingRate: 0.0002 }) },
  // Both readings inside the noise band: a wobble across zero, not a regime change.
  boundary: {
    snapshot: snap({ fundingRate: FUNDING_FLIP_MIN_RATE / 2 }),
    previous: snap({ fundingRate: -FUNDING_FLIP_MIN_RATE / 2 }),
    shouldFire: false,
  },
});
check(
  'funding_flip: silent with no previous snapshot',
  run('funding_flip', snap({ fundingRate: 0.0004 }), null) === null,
);
check(
  'funding_flip: silent when the previous funding reading is missing',
  run('funding_flip', snap({ fundingRate: 0.0004 }), snap()) === null,
);
{
  const negative = run('funding_flip', snap({ fundingRate: -0.0004 }), snap({ fundingRate: 0.0004 }));
  check('funding_flip: flip to negative is BEARISH', negative?.tag === 'BEARISH', `got ${negative?.tag}`);
}

quartet('funding_extreme', {
  // Contrarian: crowd heavily long is read BEARISH.
  fires: { snapshot: snap({ fundingRate: 0.0015 }), tag: 'BEARISH' },
  quiet: { snapshot: snap({ fundingRate: 0.0001 }) },
  boundary: { snapshot: snap({ fundingRate: FUNDING_EXTREME_RATE }), shouldFire: true },
});
{
  const short = run('funding_extreme', snap({ fundingRate: -0.0015 }));
  check('funding_extreme: crowd heavily short is BULLISH', short?.tag === 'BULLISH', `got ${short?.tag}`);
  check(
    'funding_extreme: negative extreme is detected by magnitude, not sign',
    run('funding_extreme', snap({ fundingRate: -FUNDING_EXTREME_RATE })) !== null,
  );
}

// ---------------------------------------------------------------------------
section('Open interest, ETF, volume');
// ---------------------------------------------------------------------------

quartet('oi_surge', {
  fires: {
    snapshot: snap({ openInterestChange24hPct: 25, price: 100 }),
    previous: snap({ price: 100.4 }),
    tag: 'NEUTRAL',
  },
  quiet: { snapshot: snap({ openInterestChange24hPct: 5, price: 100 }), previous: snap({ price: 100 }) },
  boundary: {
    snapshot: snap({ openInterestChange24hPct: OI_SURGE_CHANGE_PCT, price: 100 }),
    previous: snap({ price: 100 }),
    shouldFire: true,
  },
});
check(
  'oi_surge: does not fire when price moved too much to call flat',
  run(
    'oi_surge',
    snap({ openInterestChange24hPct: 25, price: 100 }),
    snap({ price: 100 * (1 + (OI_SURGE_PRICE_FLAT_PCT + 0.5) / 100) }),
  ) === null,
);
check(
  'oi_surge: price exactly at the flatness limit still counts as flat',
  run(
    'oi_surge',
    snap({ openInterestChange24hPct: 25, price: 100 }),
    snap({ price: 100 * (1 + OI_SURGE_PRICE_FLAT_PCT / 100) }),
  ) !== null,
);
check(
  'oi_surge: silent with no previous snapshot',
  run('oi_surge', snap({ openInterestChange24hPct: 25 }), null) === null,
);

quartet('etf_streak', {
  fires: { snapshot: snap({ etfStreakDays: 8, etfNetFlowUsd: 190_000_000 }), tag: 'BULLISH' },
  quiet: { snapshot: snap({ etfStreakDays: 2, etfNetFlowUsd: 190_000_000 }) },
  boundary: {
    snapshot: snap({ etfStreakDays: ETF_STREAK_DAYS, etfNetFlowUsd: 190_000_000 }),
    shouldFire: true,
  },
});
{
  // The collector returns an unsigned day count and carries direction in the
  // flow itself, so an outflow streak must still fire — as BEARISH.
  const outflow = run('etf_streak', snap({ etfStreakDays: 7, etfNetFlowUsd: -120_000_000 }));
  check('etf_streak: an outflow streak fires as BEARISH', outflow?.tag === 'BEARISH', `got ${outflow?.tag}`);
  check(
    'etf_streak: a zero net flow has no direction, so no signal',
    run('etf_streak', snap({ etfStreakDays: 9, etfNetFlowUsd: 0 })) === null,
  );
  check(
    'etf_streak: streak count without a flow reading stays quiet',
    run('etf_streak', snap({ etfStreakDays: 9 })) === null,
  );
}

quartet('volume_spike', {
  fires: { snapshot: snap({ volumeZDaily: 3.4 }), tag: 'NEUTRAL' },
  quiet: { snapshot: snap({ volumeZDaily: 0.4 }) },
  boundary: { snapshot: snap({ volumeZDaily: VOLUME_SPIKE_Z }), shouldFire: true },
});
check(
  'volume_spike: an unusually QUIET day is not a spike',
  run('volume_spike', snap({ volumeZDaily: -3 })) === null,
);

// ---------------------------------------------------------------------------
section('Structure and sentiment');
// ---------------------------------------------------------------------------

quartet('ma_compression', {
  fires: { snapshot: snap({ ma74h: 2500, ma254h: 2495 }), tag: 'NEUTRAL' },
  quiet: { snapshot: snap({ ma74h: 2500, ma254h: 2200 }) },
  boundary: {
    // Spread exactly at the limit — the rule is documented as `<=`, so it fires.
    snapshot: snap({ ma254h: 1000, ma74h: 1000 * (1 + MA_COMPRESSION_PCT / 100) }),
    shouldFire: true,
  },
});
check(
  'ma_compression: a zero MA25 cannot yield a percentage, so no signal',
  run('ma_compression', snap({ ma74h: 10, ma254h: 0 })) === null,
);
{
  const tight = run('ma_compression', snap({ ma74h: 1000, ma254h: 1000 }));
  const loose = run('ma_compression', snap({ ma74h: 1004, ma254h: 1000 }));
  check(
    'ma_compression: a tighter squeeze scores higher',
    tight !== null && loose !== null && tight.severity > loose.severity,
    `${tight?.severity.toFixed(2)} vs ${loose?.severity.toFixed(2)}`,
  );
}

quartet('fear_greed_extreme', {
  fires: { snapshot: snap({ fearGreed: 9 }), tag: 'BULLISH' },
  quiet: { snapshot: snap({ fearGreed: 50 }) },
  boundary: { snapshot: snap({ fearGreed: FEAR_GREED_FEAR }), shouldFire: true },
});
{
  const greed = run('fear_greed_extreme', snap({ fearGreed: 91 }));
  check('fear_greed_extreme: extreme greed is BEARISH', greed?.tag === 'BEARISH', `got ${greed?.tag}`);
  check(
    'fear_greed_extreme: the greed threshold itself fires',
    run('fear_greed_extreme', snap({ fearGreed: FEAR_GREED_GREED })) !== null,
  );
  check(
    'fear_greed_extreme: just inside the neutral band stays quiet',
    run('fear_greed_extreme', snap({ fearGreed: FEAR_GREED_FEAR + 1 })) === null &&
      run('fear_greed_extreme', snap({ fearGreed: FEAR_GREED_GREED - 1 })) === null,
  );
}


// ---------------------------------------------------------------------------
section('Second rule set');
// ---------------------------------------------------------------------------

quartet('ma_cross_daily', {
  fires: {
    snapshot: snap({ ma7Daily: 2510, ma25Daily: 2500 }),
    previous: snap({ ma7Daily: 2480, ma25Daily: 2500 }),
    tag: 'BULLISH',
  },
  // Same side before and after: no cross happened.
  quiet: {
    snapshot: snap({ ma7Daily: 2510, ma25Daily: 2500 }),
    previous: snap({ ma7Daily: 2505, ma25Daily: 2500 }),
  },
  // Previous spread exactly zero — the tie is resolved this bar, not crossed twice.
  boundary: {
    snapshot: snap({ ma7Daily: 2510, ma25Daily: 2500 }),
    previous: snap({ ma7Daily: 2500, ma25Daily: 2500 }),
    shouldFire: false,
  },
});
{
  const death = run(
    'ma_cross_daily',
    snap({ ma7Daily: 2480, ma25Daily: 2500 }),
    snap({ ma7Daily: 2520, ma25Daily: 2500 }),
  );
  check('ma_cross_daily: a downward cross is BEARISH', death?.tag === 'BEARISH', `got ${death?.tag}`);
  check(
    'ma_cross_daily: silent with no previous snapshot',
    run('ma_cross_daily', snap({ ma7Daily: 2510, ma25Daily: 2500 }), null) === null,
  );
  check(
    'ma_cross_daily: silent when the previous MAs are missing',
    run('ma_cross_daily', snap({ ma7Daily: 2510, ma25Daily: 2500 }), snap()) === null,
  );
}

quartet('long_short_extreme', {
  fires: { snapshot: snap({ longShortRatio: 3.1 }), tag: 'BEARISH' },
  quiet: { snapshot: snap({ longShortRatio: 1.1 }) },
  boundary: { snapshot: snap({ longShortRatio: LONG_SHORT_LONG_HEAVY }), shouldFire: true },
});
{
  const shortHeavy = run('long_short_extreme', snap({ longShortRatio: 0.3 }));
  check(
    'long_short_extreme: a short-heavy crowd is BULLISH',
    shortHeavy?.tag === 'BULLISH',
    `got ${shortHeavy?.tag}`,
  );
  check(
    'long_short_extreme: the short-side threshold itself fires',
    run('long_short_extreme', snap({ longShortRatio: LONG_SHORT_SHORT_HEAVY })) !== null,
  );
  check(
    'long_short_extreme: a non-positive ratio is nonsense, not a signal',
    run('long_short_extreme', snap({ longShortRatio: 0 })) === null,
  );
  // The whole reason severity is computed in log space.
  const long4 = run('long_short_extreme', snap({ longShortRatio: 4 }));
  const short025 = run('long_short_extreme', snap({ longShortRatio: 0.25 }));
  check(
    'long_short_extreme: mirrored skews (4.0 and 0.25) score equally',
    long4 !== null &&
      short025 !== null &&
      Math.abs(long4.severity - short025.severity) < 1e-9,
    `${long4?.severity.toFixed(4)} vs ${short025?.severity.toFixed(4)}`,
  );
}

quartet('sentiment_swing', {
  fires: { snapshot: snap({ fearGreed: 72, fearGreed7dAgo: 35 }), tag: 'BULLISH' },
  quiet: { snapshot: snap({ fearGreed: 52, fearGreed7dAgo: 48 }) },
  boundary: {
    snapshot: snap({ fearGreed: 30 + SENTIMENT_SWING_POINTS, fearGreed7dAgo: 30 }),
    shouldFire: true,
  },
});
{
  const cooling = run('sentiment_swing', snap({ fearGreed: 24, fearGreed7dAgo: 66 }));
  check('sentiment_swing: a downward swing is BEARISH', cooling?.tag === 'BEARISH', `got ${cooling?.tag}`);
  check(
    'sentiment_swing: needs the 7-day-ago reading, not just today',
    run('sentiment_swing', snap({ fearGreed: 72 })) === null,
  );
  // Distinct from fear_greed_extreme: a big swing wholly inside the neutral band.
  const midBand = run('sentiment_swing', snap({ fearGreed: 58, fearGreed7dAgo: 30 }));
  check(
    'sentiment_swing: fires inside the neutral band where fear_greed_extreme cannot',
    midBand !== null && run('fear_greed_extreme', snap({ fearGreed: 58 })) === null,
  );
}

quartet('price_stretched_ma99', {
  fires: { snapshot: snap({ pctFromMa99Daily: 46 }), tag: 'BEARISH' },
  quiet: { snapshot: snap({ pctFromMa99Daily: 8 }) },
  boundary: { snapshot: snap({ pctFromMa99Daily: MA99_STRETCH_PCT }), shouldFire: true },
});
{
  const below = run('price_stretched_ma99', snap({ pctFromMa99Daily: -41 }));
  check(
    'price_stretched_ma99: stretched below the mean is BULLISH',
    below?.tag === 'BULLISH',
    `got ${below?.tag}`,
  );
  check(
    'price_stretched_ma99: the negative threshold fires too',
    run('price_stretched_ma99', snap({ pctFromMa99Daily: -MA99_STRETCH_PCT })) !== null,
  );
}

quartet('structure_flip_daily', {
  fires: {
    snapshot: snap({ structureDaily: 'HH-HL' }),
    previous: snap({ structureDaily: 'RANGE' }),
    tag: 'BULLISH',
  },
  quiet: {
    snapshot: snap({ structureDaily: 'HH-HL' }),
    previous: snap({ structureDaily: 'HH-HL' }),
  },
  boundary: {
    // Into RANGE: a real change, but directionless.
    snapshot: snap({ structureDaily: 'RANGE' }),
    previous: snap({ structureDaily: 'HH-HL' }),
    shouldFire: true,
  },
});
{
  const intoRange = run(
    'structure_flip_daily',
    snap({ structureDaily: 'RANGE' }),
    snap({ structureDaily: 'LH-LL' }),
  );
  check('structure_flip_daily: a move into RANGE is NEUTRAL', intoRange?.tag === 'NEUTRAL', `got ${intoRange?.tag}`);
  const breakdown = run(
    'structure_flip_daily',
    snap({ structureDaily: 'LH-LL' }),
    snap({ structureDaily: 'HH-HL' }),
  );
  check('structure_flip_daily: a breakdown is BEARISH', breakdown?.tag === 'BEARISH', `got ${breakdown?.tag}`);
  check(
    'structure_flip_daily: silent when the previous structure is unknown',
    run('structure_flip_daily', snap({ structureDaily: 'HH-HL' }), snap()) === null,
  );
}

quartet('volatility_expansion', {
  fires: { snapshot: snap({ price: 100, atrDaily: 9 }), tag: 'NEUTRAL' },
  quiet: { snapshot: snap({ price: 100, atrDaily: 2 }) },
  boundary: {
    snapshot: snap({ price: 100, atrDaily: ATR_EXPANSION_PCT }),
    shouldFire: true,
  },
});
check(
  'volatility_expansion: a non-positive price cannot yield a percentage',
  run('volatility_expansion', snap({ price: 0, atrDaily: 9 })) === null,
);

// ---------------------------------------------------------------------------
section('Invariants across every registered rule');
// ---------------------------------------------------------------------------

{
  const empty = snap();

  for (const rule of RULES) {
    check(
      `${rule.ruleId}: an all-null snapshot produces nothing (no previous)`,
      rule.run(empty, null) === null,
    );
    check(
      `${rule.ruleId}: an all-null snapshot produces nothing (all-null previous)`,
      rule.run(empty, empty) === null,
    );
  }

  check('every rule id is unique', new Set(RULES.map((r) => r.ruleId)).size === RULES.length);
  check(
    'RULES_BY_ID covers every rule',
    RULES.every((r) => RULES_BY_ID[r.ruleId] === r) &&
      Object.keys(RULES_BY_ID).length === RULES.length,
  );

  // Every rule must have been exercised above, or the suite is lying about coverage.
  const exercised = new Set(produced.map((p) => p.ruleId));
  for (const rule of RULES) {
    check(`${rule.ruleId}: covered by at least one firing case`, exercised.has(rule.ruleId));
  }
}

// ---------------------------------------------------------------------------
section('Shape of every signal produced above');
// ---------------------------------------------------------------------------

/** Words = whitespace-separated tokens containing at least one letter or digit. */
const wordCount = (text: string): number =>
  text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

const VALID_TAGS = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);

for (const { ruleId, signal } of produced) {
  check(
    `${ruleId}: severity within 0..1`,
    Number.isFinite(signal.severity) && signal.severity >= 0 && signal.severity <= 1,
    `got ${signal.severity}`,
  );
  check(`${ruleId}: tag is one of the three`, VALID_TAGS.has(signal.tag), `got ${signal.tag}`);
  // functional-spec 2.1: headline <= 8 words, body <= 20.
  check(
    `${ruleId}: title within 8 words`,
    wordCount(signal.title) <= 8,
    `${wordCount(signal.title)} words: "${signal.title}"`,
  );
  check(
    `${ruleId}: body within 20 words`,
    wordCount(signal.body) <= 20,
    `${wordCount(signal.body)} words: "${signal.body}"`,
  );
  // Risk 8.1: a body without a number is a restatement of the chart.
  check(`${ruleId}: body carries the measured value`, /\d/.test(signal.body), `"${signal.body}"`);
  check(`${ruleId}: source is set`, signal.source.trim().length > 0);
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed across ${RULES.length} rules.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
