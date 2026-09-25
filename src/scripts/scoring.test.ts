/**
 * Scoring maths tests for spec 011 (technical-considerations §3, §7).
 *
 * Run:  npx tsx src/scripts/scoring.test.ts
 *
 * No database, no network, no test runner — the scoring maths is pure, so plain
 * fixtures and assertions are enough. Exits non-zero on failure.
 *
 * Follows the `src/scripts/signal-rules.test.ts` pattern: a `check(name, ok)`
 * harness counting failures, `section` headers, and `process.exit(failures === 0
 * ? 0 : 1)` at the end.
 *
 * The boundary-exact and degenerate cases are the ones that will actually occur
 * and the ones no reviewer would catch by eye (technical-considerations §7).
 */

import {
  MIN_SCORED_SAMPLE_SIZE,
  NO_SKILL_BRIER_BASELINE,
  PROBABILITY_SUM_TOLERANCE_PCT,
  SCORED_HORIZON_DAYS,
  SPARSE_HORIZON_BEHAVIOUR,
} from '@/consts/scoring';
import type { ForecastPoint, ModelHorizonScore, ScenarioProbabilities } from '@/data/types';
import { brierScore } from '@/lib/scoring/brier';
import {
  buildHorizonBreakdown,
  formatHorizonCounts,
  type HorizonEntry,
  horizonLabel,
} from '@/lib/scoring/horizonBreakdown';
import {
  realizedScenario,
  type ScenarioPrices,
  scenarioPricesAtHorizon,
} from '@/lib/scoring/realizedScenario';

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

const EPSILON = 1e-9;
const near = (a: number, b: number, tol = EPSILON): boolean => Math.abs(a - b) <= tol;

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const probs = (bull: number, base: number, bear: number): ScenarioProbabilities => ({
  bull,
  base,
  bear,
});

// ---------------------------------------------------------------------------
section('Brier — the three reference points (technical-considerations §3)');
// ---------------------------------------------------------------------------

{
  // Perfect, confident: all probability on the scenario that happened → 0.
  check(
    'brier: perfect confident forecast scores 0',
    near(brierScore(probs(100, 0, 0), 'bull'), 0),
    `${brierScore(probs(100, 0, 0), 'bull')}`,
  );

  // Uniform 1/3, 1/3, 1/3 → 0.667 regardless of which scenario occurred.
  for (const scenario of ['bull', 'base', 'bear'] as const) {
    const score = brierScore(probs(100 / 3, 100 / 3, 100 / 3), scenario);
    check(
      `brier: uniform 1/3 scores the no-skill baseline (${scenario})`,
      near(score, 2 / 3, 1e-9),
      `${score}`,
    );
    check(
      `brier: uniform 1/3 rounds to NO_SKILL_BRIER_BASELINE (${scenario})`,
      Number(score.toFixed(3)) === NO_SKILL_BRIER_BASELINE,
      `${score.toFixed(3)} vs ${NO_SKILL_BRIER_BASELINE}`,
    );
  }

  // Fully confident and wrong → 2, the maximum.
  check(
    'brier: fully confident and wrong scores 2',
    near(brierScore(probs(100, 0, 0), 'bear'), 2),
    `${brierScore(probs(100, 0, 0), 'bear')}`,
  );
}

// ---------------------------------------------------------------------------
section('Brier — ordering and range');
// ---------------------------------------------------------------------------

{
  const confidentRight = brierScore(probs(90, 5, 5), 'bull');
  const hesitantRight = brierScore(probs(50, 30, 20), 'bull');
  check(
    'brier: more probability on the realized scenario scores better',
    confidentRight < hesitantRight,
    `${confidentRight} vs ${hesitantRight}`,
  );

  for (const [p, realized] of [
    [probs(90, 5, 5), 'bull'],
    [probs(34, 33, 33), 'bear'],
    [probs(0, 100, 0), 'base'],
    [probs(10, 20, 70), 'bull'],
  ] as const) {
    const score = brierScore(p, realized);
    check(
      `brier: stays within 0..2 (${JSON.stringify(p)} → ${realized})`,
      score >= 0 && score <= 2,
      `${score}`,
    );
  }
}

// ---------------------------------------------------------------------------
section('Brier — non-100 probability sums are handled deliberately (§7)');
// ---------------------------------------------------------------------------

{
  // Within tolerance → normalised, not rejected. 33.4/33.3/33.3 sums to 100.0
  // exactly here, so use a rounding-style wobble that still sums within 1pp.
  const withinTolerance = probs(33, 33, 33); // sum 99, inside 100 ± 1
  check(
    'brier: sum within tolerance is normalised (does not throw)',
    !throws(() => brierScore(withinTolerance, 'bull')),
  );
  {
    const score = brierScore(withinTolerance, 'bull');
    // Normalised to exact thirds → same as the uniform baseline.
    check(
      'brier: a 99 sum normalises to the same score as an exact-100 uniform',
      near(score, 2 / 3, 1e-9),
      `${score}`,
    );
  }

  check(
    `brier: sum outside 100 ± ${PROBABILITY_SUM_TOLERANCE_PCT}pp is rejected (too low)`,
    throws(() => brierScore(probs(10, 10, 10), 'bull')),
  );
  check(
    `brier: sum outside 100 ± ${PROBABILITY_SUM_TOLERANCE_PCT}pp is rejected (too high)`,
    throws(() => brierScore(probs(60, 60, 60), 'bull')),
  );
  check(
    'brier: a negative probability is rejected',
    throws(() => brierScore(probs(120, -10, -10), 'bull')),
  );
  check(
    'brier: a non-finite probability is rejected',
    throws(() => brierScore(probs(Number.NaN, 50, 50), 'bull')),
  );
  check(
    'brier: an all-zero distribution is rejected, not divided by zero',
    throws(() => brierScore(probs(0, 0, 0), 'bull')),
  );
}

// ---------------------------------------------------------------------------
section('Realized scenario — one case per band');
// ---------------------------------------------------------------------------

{
  // Well-ordered curve: bear 90, base 100, bull 120.
  // bear boundary = 95, bull boundary = 110.
  const ordered: ScenarioPrices = { bear: 90, base: 100, bull: 120 };

  check(
    'realized: a price above the bull boundary is bull',
    realizedScenario(ordered, 115) === 'bull',
  );
  check(
    'realized: a price between the boundaries is base',
    realizedScenario(ordered, 100) === 'base',
  );
  check(
    'realized: a price below the bear boundary is bear',
    realizedScenario(ordered, 92) === 'bear',
  );
}

// ---------------------------------------------------------------------------
section('Realized scenario — both boundaries resolve to base');
// ---------------------------------------------------------------------------

{
  const ordered: ScenarioPrices = { bear: 90, base: 100, bull: 120 };
  // midpoint(bear, base) = 95, midpoint(base, bull) = 110.
  check(
    'realized: exactly on midpoint(bear, base) resolves to base',
    realizedScenario(ordered, 95) === 'base',
  );
  check(
    'realized: exactly on midpoint(base, bull) resolves to base',
    realizedScenario(ordered, 110) === 'base',
  );
}

// ---------------------------------------------------------------------------
section('Realized scenario — degenerate curves are unscoreable, not a guess');
// ---------------------------------------------------------------------------

{
  check(
    'realized: bear == base → null',
    realizedScenario({ bear: 100, base: 100, bull: 120 }, 130) === null,
  );
  check(
    'realized: base == bull → null',
    realizedScenario({ bear: 90, base: 110, bull: 110 }, 80) === null,
  );
  check(
    'realized: all three equal → null',
    realizedScenario({ bear: 100, base: 100, bull: 100 }, 100) === null,
  );
}

// ---------------------------------------------------------------------------
section('Realized scenario — unsorted curves are still partitioned by price');
// ---------------------------------------------------------------------------

{
  // The forecast layer does not enforce bull > base > bear. Here the labelled
  // "bull" price sits below "base" at this horizon. Partitioning is by sorted
  // price position: lowest band = bear, middle = base, highest = bull.
  // Sorted: 90, 100, 120 → bear boundary 95, bull boundary 110.
  const crossed: ScenarioPrices = { bull: 90, base: 100, bear: 120 };

  check(
    'realized (unsorted): 130 falls in the highest band → bull',
    realizedScenario(crossed, 130) === 'bull',
  );
  check(
    'realized (unsorted): 100 falls in the middle band → base',
    realizedScenario(crossed, 100) === 'base',
  );
  check(
    'realized (unsorted): 80 falls in the lowest band → bear',
    realizedScenario(crossed, 80) === 'bear',
  );

  // Same partition as the well-ordered fixture with the same three prices.
  const ordered: ScenarioPrices = { bear: 90, base: 100, bull: 120 };
  for (const price of [80, 92, 95, 100, 110, 115, 130]) {
    check(
      `realized: label order does not change the partition at ${price}`,
      realizedScenario(crossed, price) === realizedScenario(ordered, price),
      `${realizedScenario(crossed, price)} vs ${realizedScenario(ordered, price)}`,
    );
  }
}

// ---------------------------------------------------------------------------
section('Horizon lookup — sparse-horizon behaviour is "skip" (§8.3)');
// ---------------------------------------------------------------------------

{
  check('consts: SPARSE_HORIZON_BEHAVIOUR is "skip"', SPARSE_HORIZON_BEHAVIOUR === 'skip');

  const curve = (prices: Record<number, number>): ForecastPoint[] =>
    Object.entries(prices).map(([d, p]) => ({ d: Number(d), p }));

  const curves = {
    bull: curve({ 1: 105, 7: 130, 30: 200 }),
    base: curve({ 1: 100, 7: 110, 30: 140 }),
    bear: curve({ 1: 95, 7: 90, 30: 80 }),
  };

  const at7 = scenarioPricesAtHorizon(curves, 7);
  check(
    'horizon lookup: exact day present on every curve returns the three prices',
    at7 !== null && at7.bull === 130 && at7.base === 110 && at7.bear === 90,
    JSON.stringify(at7),
  );

  check(
    'horizon lookup: no point at the horizon on one curve → null (skip, not nearest)',
    scenarioPricesAtHorizon(curves, 6) === null,
  );

  const missingBull = {
    bull: curve({ 1: 105, 30: 200 }),
    base: curves.base,
    bear: curves.bear,
  };
  check(
    'horizon lookup: a single missing scenario point at the horizon → null',
    scenarioPricesAtHorizon(missingBull, 7) === null,
  );

  // End to end: lookup then partition.
  const prices = scenarioPricesAtHorizon(curves, 30);
  check(
    'horizon lookup + realized: day-30 actual of 210 resolves to bull',
    prices !== null && realizedScenario(prices, 210) === 'bull',
  );
}

// ---------------------------------------------------------------------------
section('Constants sanity');
// ---------------------------------------------------------------------------

{
  check('consts: NO_SKILL_BRIER_BASELINE is 0.667', NO_SKILL_BRIER_BASELINE === 0.667);
  check('consts: SCORED_HORIZON_DAYS is [1, 7, 30]', SCORED_HORIZON_DAYS.join(',') === '1,7,30');
  check(
    'consts: MIN_SCORED_SAMPLE_SIZE is a positive integer',
    Number.isInteger(MIN_SCORED_SAMPLE_SIZE) && MIN_SCORED_SAMPLE_SIZE > 0,
  );
}

// ---------------------------------------------------------------------------
// Horizon breakdown (spec 026)
// ---------------------------------------------------------------------------

section('horizonBreakdown');
{
  const order = (es: HorizonEntry[]): string => es.map((e) => e.horizonDays).join(',');

  check('empty input -> 3 entries in 1,7,30 order', order(buildHorizonBreakdown([])) === '1,7,30');
  const shuffled = buildHorizonBreakdown([
    { horizonDays: 30, scoredCount: 40, meanBrier: 0.5 },
    { horizonDays: 1, scoredCount: 40, meanBrier: 0.5 },
    { horizonDays: 7, scoredCount: 40, meanBrier: 0.5 },
  ]);
  check('shuffled input keeps 1,7,30 order', order(shuffled) === '1,7,30');

  const sparse = buildHorizonBreakdown([
    { horizonDays: 14, scoredCount: 99, meanBrier: 0.1 },
    { horizonDays: 7, scoredCount: 9, meanBrier: 0.4 },
  ]);
  check('stray horizon 14 dropped', order(sparse) === '1,7,30');
  check('missing horizons zero-filled', sparse[0].scoredCount === 0 && sparse[2].scoredCount === 0);
  check('zero-filled entries are insufficient', sparse[0].state === 'insufficient');

  const at = (n: number, mb: number | null): HorizonEntry =>
    buildHorizonBreakdown([{ horizonDays: 1, scoredCount: n, meanBrier: mb }])[0];
  check('29 scored -> insufficient', at(MIN_SCORED_SAMPLE_SIZE - 1, 0.5).state === 'insufficient');
  check('30 scored -> scored', at(MIN_SCORED_SAMPLE_SIZE, 0.5).state === 'scored');
  check('count >= 30 but null meanBrier -> insufficient', at(50, null).state === 'insufficient');

  const good = at(30, 0.5);
  check(
    '0.5 beats baseline, delta 0.167',
    good.state === 'scored' && good.beating && near(good.delta, NO_SKILL_BRIER_BASELINE - 0.5),
  );
  const bad = at(30, 0.8);
  check(
    '0.8 is below baseline, delta 0.133',
    bad.state === 'scored' && !bad.beating && near(bad.delta, 0.8 - NO_SKILL_BRIER_BASELINE),
  );

  const example = buildHorizonBreakdown([
    { horizonDays: 1, scoredCount: 94, meanBrier: 0.55 },
    { horizonDays: 30, scoredCount: 12, meanBrier: 0.6 },
  ]);
  check('94 one-day -> scored', example[0].state === 'scored');
  check(
    '12 thirty-day -> insufficient with count 12',
    example[2].state === 'insufficient' && example[2].scoredCount === 12,
  );

  const early = buildHorizonBreakdown([
    { horizonDays: 1, scoredCount: 14, meanBrier: 0.5 },
    { horizonDays: 7, scoredCount: 9, meanBrier: 0.5 },
  ]);
  check(
    'formatHorizonCounts exact string',
    formatHorizonCounts(early) === '1 day: 14 · 7 days: 9 · 30 days: 0',
    formatHorizonCounts(early),
  );
  check('horizonLabel singular/plural', horizonLabel(1) === '1 day' && horizonLabel(7) === '7 days');

  const inputs: ModelHorizonScore[] = [
    { horizonDays: 1, scoredCount: 94, meanBrier: 0.5 },
    { horizonDays: 7, scoredCount: 20, meanBrier: 0.6 },
    { horizonDays: 30, scoredCount: 12, meanBrier: 0.7 },
  ];
  const sum = (xs: { scoredCount: number }[]): number => xs.reduce((s, x) => s + x.scoredCount, 0);
  check('entry counts add up to input counts', sum(buildHorizonBreakdown(inputs)) === sum(inputs));
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
