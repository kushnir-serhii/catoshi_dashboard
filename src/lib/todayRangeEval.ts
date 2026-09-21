/**
 * Pure evaluation logic for the spec 024 calibration gate (technical §4).
 * No I/O: the backtest script feeds it candles and prints `renderReport`.
 *
 * ORIGIN / LOOK-AHEAD CONVENTION
 *   An origin is a bar index `i` in an oldest-first hourly series. Bar `i` is the
 *   LAST CLOSED bar at the origin, so the origin instant is `openTime[i] + 1h` and
 *   spot = `close[i]`. Sigma is computed from `close[0..i]` inclusive and nothing
 *   later (`sigmaAt`). Realized outcomes for horizon T live strictly after the
 *   origin: close = `close[i+T]`, max high / min low over bars `i+1..i+T`.
 *   Origins whose horizon has a gap in the candle series are skipped.
 *
 * `k` is fitted on the train split only (`fitK`) and applied unchanged to test.
 */

import {
  TODAY_GATE_BAND50_MAX,
  TODAY_GATE_BAND50_MIN,
  TODAY_GATE_BAND90_MAX,
  TODAY_GATE_BAND90_MIN,
  TODAY_GATE_BOOTSTRAP_BLOCK,
  TODAY_GATE_BOOTSTRAP_ITERATIONS,
  TODAY_GATE_BOOTSTRAP_SEED,
  TODAY_GATE_BUCKET_MAX_GAP_PP,
  TODAY_GATE_BUCKET_MIN_N,
  TODAY_GATE_FIT_COVERAGE,
  TODAY_GATE_HORIZON_HOURS,
  TODAY_GATE_LEVEL_PCTS,
  TODAY_GATE_TRAIN_FRACTION,
  TODAY_VOL_BARS,
} from '@/consts/today';
import {
  closeBeyondProbability,
  ewmaSigmaHourly,
  quantiles,
  touchProbability,
  type EwmaOptions,
} from '@/lib/todayRange';

const HOUR_MS = 3_600_000;
const Z90 = 1.645;

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 'utc-day' = every origin priced to the next 00:00 UTC (T = 1..24). */
export type GateHorizon = number | 'utc-day';

export interface OriginResult {
  originIdx: number;
  T: number;
  spot: number;
  /** RAW hourly sigma (no k). */
  sigmaRaw: number;
  realizedClose: number;
  maxHigh: number;
  minLow: number;
}

export interface EvalOptions {
  horizon: GateHorizon;
  sigma?: EwmaOptions;
  /** Restrict to these origin indices (tests); default is every possible origin. */
  originIdxs?: number[];
}

/**
 * EWMA sigma at origin `originIdx` using ONLY `close[0..originIdx]`. Bars after
 * the origin are never read. Returns null with too little history.
 */
export function sigmaAt(
  candles: Candle[],
  originIdx: number,
  opts: EwmaOptions = {},
): number | null {
  const bars = opts.bars ?? TODAY_VOL_BARS;
  const start = Math.max(0, originIdx - bars);
  const closes: number[] = [];
  for (let j = start; j <= originIdx; j += 1) closes.push(candles[j].close);
  return ewmaSigmaHourly(closes, opts);
}

/** Hours from origin instant to the next 00:00 UTC (1..24). */
function hoursToUtcMidnight(candle: Candle): number {
  const originTime = candle.openTime + HOUR_MS;
  const hourOfDay = Math.floor((originTime % (24 * HOUR_MS)) / HOUR_MS);
  return 24 - hourOfDay;
}

/** Realized outcomes for every valid origin. Sigma is stored RAW so any `k` can be applied later. */
export function evaluateOrigins(candles: Candle[], opts: EvalOptions): OriginResult[] {
  const out: OriginResult[] = [];
  const idxs = opts.originIdxs ?? candles.map((_, i) => i);
  for (const i of idxs) {
    if (i < 0 || i >= candles.length) continue;
    const T = opts.horizon === 'utc-day' ? hoursToUtcMidnight(candles[i]) : opts.horizon;
    if (i + T >= candles.length) continue;
    // Contiguity: the horizon bar must be exactly T hours after the origin bar.
    if (candles[i + T].openTime !== candles[i].openTime + T * HOUR_MS) continue;
    const sigmaRaw = sigmaAt(candles, i, opts.sigma);
    if (sigmaRaw === null || !(sigmaRaw > 0)) continue;
    let maxHigh = -Infinity;
    let minLow = Infinity;
    for (let j = i + 1; j <= i + T; j += 1) {
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
      if (candles[j].low < minLow) minLow = candles[j].low;
    }
    out.push({
      originIdx: i,
      T,
      spot: candles[i].close,
      sigmaRaw,
      realizedClose: candles[i + T].close,
      maxHigh,
      minLow,
    });
  }
  return out;
}

/**
 * Fit the per-asset scalar k on TRAIN results only. Method: the 90% band is
 * `spot * exp(+-1.645 * k * sigmaRaw * sqrt(T))`, so a close is inside iff
 * `s = |ln(close/spot)| / (1.645 * sigmaRaw * sqrt(T)) <= k`. Hence k is exactly the
 * empirical `coverage`-quantile (default 0.9) of s (nearest-rank), which gives train
 * coverage >= 90% with no iteration. Returns null when there is no usable data.
 */
export function fitK(train: OriginResult[], coverage = TODAY_GATE_FIT_COVERAGE): number | null {
  const scores = train
    .map((r) => Math.abs(Math.log(r.realizedClose / r.spot)) / (Z90 * r.sigmaRaw * Math.sqrt(r.T)))
    .filter((s) => Number.isFinite(s))
    .sort((a, b) => a - b);
  if (scores.length === 0) return null;
  const rank = Math.min(scores.length, Math.max(1, Math.ceil(coverage * scores.length)));
  return scores[rank - 1];
}

export interface TimeSplit {
  /** Half-open index ranges into the (chronological) origin list. */
  train: [number, number];
  test: [number, number];
}

/**
 * Chronological split of `n` origins: train = first `frac`, then `gapBars` skipped,
 * test = the rest. With gap >= horizon no train realized window overlaps a test origin.
 */
export function splitByTime(
  n: number,
  frac = TODAY_GATE_TRAIN_FRACTION,
  gapBars = TODAY_GATE_HORIZON_HOURS,
): TimeSplit {
  const trainEnd = Math.floor(n * frac);
  const testStart = Math.min(n, trainEnd + gapBars);
  return { train: [0, trainEnd], test: [testStart, n] };
}

export function inBand(r: OriginResult, k: number, band: 50 | 90): boolean {
  const q = quantiles(r.spot, k * r.sigmaRaw, r.T);
  const [lo, hi] = band === 90 ? [q.p05, q.p95] : [q.p25, q.p75];
  return r.realizedClose >= lo && r.realizedClose <= hi;
}

export interface LevelObservation {
  pct: number;
  side: 'above' | 'below';
  predTouch: number;
  predClose: number;
  touched: boolean;
  closedBeyond: boolean;
}

/** Predicted vs realized touch / close-beyond for every configured level, both sides. */
export function levelObservations(
  results: OriginResult[],
  k: number,
  pcts: readonly number[] = TODAY_GATE_LEVEL_PCTS,
): LevelObservation[] {
  const out: LevelObservation[] = [];
  for (const r of results) {
    const sigma = k * r.sigmaRaw;
    for (const pct of pcts) {
      for (const side of ['above', 'below'] as const) {
        const level = r.spot * (side === 'above' ? 1 + pct / 100 : 1 - pct / 100);
        const above = side === 'above';
        out.push({
          pct,
          side,
          predTouch: touchProbability(r.spot, level, sigma, r.T),
          predClose: closeBeyondProbability(r.spot, level, sigma, r.T),
          touched: above ? r.maxHigh >= level : r.minLow <= level,
          closedBeyond: above ? r.realizedClose > level : r.realizedClose < level,
        });
      }
    }
  }
  return out;
}

/** Deterministic PRNG (mulberry32) so bootstrap results are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CoverageCi {
  mean: number;
  lo: number;
  hi: number;
}

/**
 * Coverage with a moving-block bootstrap (95% percentile interval) over the
 * chronologically ordered hit flags. Blocks of `blockLen` keep the autocorrelation
 * of overlapping 24h origins intact. Seeded, hence deterministic.
 */
export function blockBootstrapCoverage(
  hits: boolean[],
  blockLen = TODAY_GATE_BOOTSTRAP_BLOCK,
  iterations = TODAY_GATE_BOOTSTRAP_ITERATIONS,
  seed = TODAY_GATE_BOOTSTRAP_SEED,
): CoverageCi {
  const n = hits.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN };
  const mean = hits.filter(Boolean).length / n;
  const bl = Math.min(blockLen, n);
  const rand = mulberry32(seed);
  const stats: number[] = [];
  for (let it = 0; it < iterations; it += 1) {
    let count = 0;
    let total = 0;
    while (total < n) {
      const start = Math.floor(rand() * (n - bl + 1));
      for (let j = 0; j < bl && total < n; j += 1, total += 1) {
        if (hits[start + j]) count += 1;
      }
    }
    stats.push(count / n);
  }
  stats.sort((a, b) => a - b);
  return {
    mean,
    lo: stats[Math.floor(0.025 * (iterations - 1))],
    hi: stats[Math.ceil(0.975 * (iterations - 1))],
  };
}

/** Greedy non-overlapping subset: each kept origin starts at or after the previous one's horizon end. */
export function nonOverlapping(results: OriginResult[]): OriginResult[] {
  const out: OriginResult[] = [];
  let nextFree = -Infinity;
  for (const r of results) {
    if (r.originIdx >= nextFree) {
      out.push(r);
      nextFree = r.originIdx + r.T;
    }
  }
  return out;
}

export interface ReliabilityBucket {
  lo: number;
  hi: number;
  n: number;
  meanPred: number | null;
  observed: number | null;
  /** (observed - meanPred) in percentage points. */
  gapPp: number | null;
  /** n >= min sample AND |gap| > max gap. */
  flagged: boolean;
}

/** Decile reliability table: bucket = min(9, floor(p * 10)); p = 1 falls in the top bucket. */
export function reliabilityBuckets(
  pairs: { p: number; hit: boolean }[],
  minN = TODAY_GATE_BUCKET_MIN_N,
  maxGapPp = TODAY_GATE_BUCKET_MAX_GAP_PP,
): ReliabilityBucket[] {
  const sums = Array.from({ length: 10 }, () => ({ n: 0, p: 0, hits: 0 }));
  for (const { p, hit } of pairs) {
    const b = sums[Math.min(9, Math.max(0, Math.floor(p * 10)))];
    b.n += 1;
    b.p += p;
    if (hit) b.hits += 1;
  }
  return sums.map((b, i) => {
    if (b.n === 0) {
      return {
        lo: i / 10,
        hi: (i + 1) / 10,
        n: 0,
        meanPred: null,
        observed: null,
        gapPp: null,
        flagged: false,
      };
    }
    const meanPred = b.p / b.n;
    const observed = b.hits / b.n;
    const gapPp = (observed - meanPred) * 100;
    return {
      lo: i / 10,
      hi: (i + 1) / 10,
      n: b.n,
      meanPred,
      observed,
      gapPp,
      flagged: b.n >= minN && Math.abs(gapPp) > maxGapPp + 1e-9,
    };
  });
}

export interface BandReport {
  coverage: number;
  ci: CoverageCi;
  daily: { n: number; coverage: number };
}

export interface AssetReport {
  asset: string;
  horizon: GateHorizon;
  k: number;
  nTrain: number;
  nTest: number;
  trainCoverage90: number;
  band90: BandReport;
  band50: BandReport;
  /** Pooled over all levels and both sides. */
  touch: ReliabilityBucket[];
  closeBeyond: ReliabilityBucket[];
}

function bandReport(test: OriginResult[], k: number, band: 50 | 90): BandReport {
  const hits = test.map((r) => inBand(r, k, band));
  const daily = nonOverlapping(test).map((r) => inBand(r, k, band));
  return {
    coverage: hits.length ? hits.filter(Boolean).length / hits.length : NaN,
    ci: blockBootstrapCoverage(hits),
    daily: {
      n: daily.length,
      coverage: daily.length ? daily.filter(Boolean).length / daily.length : NaN,
    },
  };
}

/** Full per-asset pipeline: origins -> split -> fit k on train -> evaluate on test only. */
export function buildAssetReport(
  asset: string,
  candles: Candle[],
  horizon: GateHorizon = TODAY_GATE_HORIZON_HOURS,
  sigma?: EwmaOptions,
): AssetReport | null {
  const all = evaluateOrigins(candles, { horizon, sigma });
  const split = splitByTime(all.length);
  const train = all.slice(...split.train);
  const test = all.slice(...split.test);
  const k = fitK(train);
  if (k === null || test.length === 0) return null;
  const obs = levelObservations(test, k);
  return {
    asset,
    horizon,
    k,
    nTrain: train.length,
    nTest: test.length,
    trainCoverage90: train.filter((r) => inBand(r, k, 90)).length / train.length,
    band90: bandReport(test, k, 90),
    band50: bandReport(test, k, 50),
    touch: reliabilityBuckets(obs.map((o) => ({ p: o.predTouch, hit: o.touched }))),
    closeBeyond: reliabilityBuckets(obs.map((o) => ({ p: o.predClose, hit: o.closedBeyond }))),
  };
}

export type GateVerdict = 'A' | 'B' | 'C';

export interface AssetVerdict {
  asset: string;
  bandsPass: boolean;
  touchPass: boolean;
  closeBeyondPass: boolean;
}

export interface VerdictResult {
  verdict: GateVerdict;
  perAsset: AssetVerdict[];
}

/**
 * A = every asset passes bands, touch and close-beyond; B = every asset passes
 * bands but some touch/close-beyond bucket fails; C = any asset fails a band
 * window. Judged on the point coverage of the test split.
 */
export function verdict(reports: AssetReport[]): VerdictResult {
  const perAsset = reports.map((r) => ({
    asset: r.asset,
    bandsPass:
      r.band90.coverage >= TODAY_GATE_BAND90_MIN &&
      r.band90.coverage <= TODAY_GATE_BAND90_MAX &&
      r.band50.coverage >= TODAY_GATE_BAND50_MIN &&
      r.band50.coverage <= TODAY_GATE_BAND50_MAX,
    touchPass: !r.touch.some((b) => b.flagged),
    closeBeyondPass: !r.closeBeyond.some((b) => b.flagged),
  }));
  let v: GateVerdict;
  if (perAsset.length === 0 || perAsset.some((a) => !a.bandsPass)) v = 'C';
  else if (perAsset.every((a) => a.touchPass && a.closeBeyondPass)) v = 'A';
  else v = 'B';
  return { verdict: v, perAsset };
}

const pct1 = (x: number): string => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'n/a');

function bucketTable(buckets: ReliabilityBucket[]): string[] {
  const lines = [
    '| bucket | n | mean pred | observed | gap (pp) | flag |',
    '|---|---|---|---|---|---|',
  ];
  for (const b of buckets) {
    lines.push(
      `| ${b.lo.toFixed(1)}-${b.hi.toFixed(1)} | ${b.n} | ${b.meanPred === null ? '-' : pct1(b.meanPred)} | ${
        b.observed === null ? '-' : pct1(b.observed)
      } | ${b.gapPp === null ? '-' : b.gapPp.toFixed(1)} | ${b.flagged ? 'FAIL' : ''} |`,
    );
  }
  return lines;
}

/** Markdown report: verdict summary, then per-asset band and reliability tables. */
export function renderReport(
  reports: AssetReport[],
  result: VerdictResult,
  title = 'Today range gate',
): string {
  const lines: string[] = [`# ${title}`, '', `**Verdict: ${result.verdict}**`, ''];
  lines.push('| asset | horizon | k | bands | touch | close-beyond |', '|---|---|---|---|---|---|');
  reports.forEach((r, i) => {
    const a = result.perAsset[i];
    const mark = (ok: boolean): string => (ok ? 'pass' : 'FAIL');
    lines.push(
      `| ${r.asset} | ${r.horizon} | ${r.k.toFixed(3)} | ${mark(a.bandsPass)} | ${mark(a.touchPass)} | ${mark(a.closeBeyondPass)} |`,
    );
  });
  for (const r of reports) {
    lines.push('', `## ${r.asset} (horizon ${r.horizon})`, '');
    lines.push(
      `Train origins ${r.nTrain}, test origins ${r.nTest}, k = ${r.k.toFixed(4)}, train 90% coverage ${pct1(r.trainCoverage90)}.`,
      '',
    );
    lines.push(
      '| band | test coverage | 95% block-bootstrap CI | daily n | daily coverage |',
      '|---|---|---|---|---|',
    );
    for (const [name, b] of [
      ['90%', r.band90],
      ['50%', r.band50],
    ] as const) {
      lines.push(
        `| ${name} | ${pct1(b.coverage)} | ${pct1(b.ci.lo)} - ${pct1(b.ci.hi)} | ${b.daily.n} | ${pct1(b.daily.coverage)} |`,
      );
    }
    lines.push('', '### Touch reliability', '', ...bucketTable(r.touch));
    lines.push('', '### Close-beyond reliability', '', ...bucketTable(r.closeBeyond));
  }
  return `${lines.join('\n')}\n`;
}
