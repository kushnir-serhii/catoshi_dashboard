/**
 * Tests for the spec 024 gate evaluation logic (`src/lib/todayRangeEval.ts`).
 *
 * Run:  node --import tsx --test src/scripts/today-range-eval.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  blockBootstrapCoverage,
  buildAssetReport,
  evaluateOrigins,
  fitK,
  inBand,
  levelObservations,
  mulberry32,
  nonOverlapping,
  reliabilityBuckets,
  renderReport,
  sigmaAt,
  splitByTime,
  verdict,
  type AssetReport,
  type Candle,
  type OriginResult,
  type ReliabilityBucket,
} from '@/lib/todayRangeEval';

const HOUR = 3_600_000;

function candlesFromCloses(closes: number[], startTime = 0): Candle[] {
  return closes.map((c, i) => ({
    openTime: startTime + i * HOUR,
    open: i === 0 ? c : closes[i - 1],
    high: Math.max(c, i === 0 ? c : closes[i - 1]),
    low: Math.min(c, i === 0 ? c : closes[i - 1]),
    close: c,
  }));
}

function gbmCloses(n: number, sigma: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const closes = [100];
  for (let i = 1; i < n; i += 1) {
    const u1 = Math.max(rand(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
    closes.push(closes[i - 1] * Math.exp(sigma * z));
  }
  return closes;
}

describe('no look-ahead', () => {
  const base = gbmCloses(600, 0.004, 7);
  const a = candlesFromCloses(base);

  it('sigmaAt ignores every bar after the origin, including a far-future shock', () => {
    const origin = 200;
    const mutated = a.map((c, i) =>
      i > origin ? { ...c, close: c.close * 50, high: c.high * 50, low: c.low / 50 } : c,
    );
    mutated[599] = { ...mutated[599], close: 1e9 };
    assert.equal(sigmaAt(mutated, origin), sigmaAt(a, origin));
  });

  it('evaluateOrigins sigma at an origin is identical when only the future changes', () => {
    const origin = 300;
    const b = a.map((c, i) => (i > origin ? { ...c, close: c.close * 3 } : c));
    const ra = evaluateOrigins(a, { horizon: 24, originIdxs: [origin] });
    const rb = evaluateOrigins(b, { horizon: 24, originIdxs: [origin] });
    assert.equal(ra.length, 1);
    assert.equal(ra[0].sigmaRaw, rb[0].sigmaRaw);
    assert.equal(ra[0].spot, rb[0].spot);
    assert.notEqual(ra[0].realizedClose, rb[0].realizedClose);
  });

  it('sanity: the origin bar itself and the past DO move sigma', () => {
    const origin = 200;
    const changedNow = a.map((c, i) => (i === origin ? { ...c, close: c.close * 1.5 } : c));
    assert.notEqual(sigmaAt(changedNow, origin), sigmaAt(a, origin));
    const changedPast = a.map((c, i) => (i === origin - 5 ? { ...c, close: c.close * 1.5 } : c));
    assert.notEqual(sigmaAt(changedPast, origin), sigmaAt(a, origin));
  });

  it('sigmaAt is null with too little history', () => {
    assert.equal(sigmaAt(a, 10), null);
  });
});

describe('coverage arithmetic on a hand-built series', () => {
  // 0..60: alternating +/-1% returns => raw sigma exactly 0.01 at origin 60.
  const closes: number[] = [100];
  for (let i = 1; i <= 60; i += 1)
    closes.push(closes[i - 1] * Math.exp(i % 2 === 0 ? 0.01 : -0.01));
  const spot = closes[60];
  closes.push(spot * Math.exp(0.01)); // 61: inside 90% (0.01645) but outside 50% (0.00674) for T=1
  closes.push(spot * Math.exp(0.03)); // 62: T=2 -> 90% half-width 0.02326, so outside
  const candles = candlesFromCloses(closes);
  candles[61] = { ...candles[61], high: spot * 1.02, low: spot * 0.995 };
  candles[62] = { ...candles[62], high: spot * 1.035, low: spot * 0.99 };

  it('T=1: sigma, realized values and band membership are as computed by hand', () => {
    const [r] = evaluateOrigins(candles, { horizon: 1, originIdxs: [60] });
    assert.ok(Math.abs(r.sigmaRaw - 0.01) < 1e-12);
    assert.equal(r.spot, spot);
    assert.equal(r.realizedClose, closes[61]);
    assert.equal(r.maxHigh, spot * 1.02);
    assert.equal(r.minLow, spot * 0.995);
    assert.equal(inBand(r, 1, 90), true);
    assert.equal(inBand(r, 1, 50), false);
    // k = 2 widens 50% band to 0.01348 which now contains the 0.01 move.
    assert.equal(inBand(r, 2, 50), true);
  });

  it('T=2: close outside 90%; realized high/low span both future bars', () => {
    const [r] = evaluateOrigins(candles, { horizon: 2, originIdxs: [60] });
    assert.equal(inBand(r, 1, 90), false);
    assert.equal(r.maxHigh, spot * 1.035);
    assert.equal(r.minLow, spot * 0.99);
  });

  it('level observations: touched / closed-beyond use high>=L, low<=L, close>L, close<L', () => {
    const [r] = evaluateOrigins(candles, { horizon: 2, originIdxs: [60] });
    const obs = levelObservations([r], 1, [1, 5]);
    const get = (pct: number, side: 'above' | 'below') =>
      obs.find((o) => o.pct === pct && o.side === side)!;
    assert.equal(get(1, 'above').touched, true); // high 1.035
    assert.equal(get(1, 'above').closedBeyond, true); // close 1.03 > 1.01
    assert.equal(get(5, 'above').touched, false);
    assert.equal(get(1, 'below').touched, true); // low 0.99 <= 0.99 (boundary counts)
    assert.equal(get(1, 'below').closedBeyond, false);
    for (const o of obs) assert.ok(o.predTouch >= o.predClose);
  });

  it('skips origins whose horizon crosses a gap or the end of the series', () => {
    const gapped = candles.map((c, i) => (i >= 62 ? { ...c, openTime: c.openTime + HOUR } : c));
    assert.equal(evaluateOrigins(gapped, { horizon: 2, originIdxs: [60] }).length, 0);
    assert.equal(evaluateOrigins(candles, { horizon: 24, originIdxs: [60] }).length, 0);
  });

  it('utc-day horizon ends exactly at 00:00 UTC', () => {
    // bar 0 opens 00:00 UTC; the origin bar with openTime 20:00 closes 21:00 -> T = 3.
    const long = candlesFromCloses(gbmCloses(200, 0.004, 3));
    const rs = evaluateOrigins(long, { horizon: 'utc-day', originIdxs: [116, 119, 120, 143] });
    // 116 -> open 116h = day 4 + 20h -> T=3 ; 119 -> open 23:00 -> T=24-... origin 00:00 -> T=24
    assert.deepEqual(
      rs.map((r) => [r.originIdx, r.T]),
      [
        [116, 3],
        [119, 24],
        [120, 23],
        [143, 24],
      ],
    );
    for (const r of rs) assert.equal((r.originIdx + r.T + 1) % 24, 0); // horizon bar closes at a day boundary
  });
});

describe('fitK', () => {
  const series = candlesFromCloses(gbmCloses(2000, 0.004, 11));
  const all = evaluateOrigins(series, { horizon: 24 });
  const split = splitByTime(all.length);

  it('is the 90% empirical quantile of |z| scores on train (train coverage ~ 90%)', () => {
    const train = all.slice(...split.train);
    const k = fitK(train)!;
    const cov = train.filter((r) => inBand(r, k, 90)).length / train.length;
    assert.ok(cov >= 0.9 - 1 / train.length && cov < 0.9 + 2 / train.length, `coverage ${cov}`);
  });

  it('uses only the train slice: mutating test data does not change k', () => {
    const k1 = fitK(all.slice(...split.train));
    const mutatedTest = all.map((r, i) =>
      i >= split.test[0] ? { ...r, realizedClose: r.realizedClose * 10 } : r,
    );
    const k2 = fitK(mutatedTest.slice(...split.train));
    assert.equal(k1, k2);
  });

  it('buildAssetReport k is unaffected by candles in the test period', () => {
    const r1 = buildAssetReport('X', series)!;
    const cut = evaluateOrigins(series, { horizon: 24 });
    const testStartIdx = cut[splitByTime(cut.length).test[0]].originIdx;
    const mutated = series.map((c, i) =>
      i >= testStartIdx ? { ...c, close: c.close * (1 + 0.3 * (i % 2)), high: c.high * 2 } : c,
    );
    const r2 = buildAssetReport('X', mutated)!;
    // Same number of origins => same split; train windows end before testStartIdx.
    assert.equal(r1.k, r2.k);
  });

  it('returns null without data', () => {
    assert.equal(fitK([]), null);
  });
});

describe('splitByTime', () => {
  it('is 70/30 chronological with a gap of at least the horizon', () => {
    const s = splitByTime(1000, 0.7, 24);
    assert.deepEqual(s.train, [0, 700]);
    assert.deepEqual(s.test, [724, 1000]);
  });

  it('no train realized window reaches a test origin', () => {
    const series = candlesFromCloses(gbmCloses(1500, 0.004, 5));
    const all = evaluateOrigins(series, { horizon: 24 });
    const s = splitByTime(all.length, 0.7, 24);
    const lastTrain = all[s.train[1] - 1];
    const firstTest = all[s.test[0]];
    assert.ok(lastTrain.originIdx + lastTrain.T <= firstTest.originIdx);
  });

  it('clamps when n is tiny', () => {
    assert.deepEqual(splitByTime(10, 0.7, 24).test, [10, 10]);
  });
});

describe('reliability buckets', () => {
  it('bucket arithmetic: n, mean predicted, observed, gap in pp', () => {
    const pairs = [
      { p: 0.05, hit: false },
      { p: 0.15, hit: true },
      { p: 0.12, hit: false },
      { p: 1, hit: true }, // p = 1 goes to the top bucket
      { p: 0.95, hit: false },
    ];
    const b = reliabilityBuckets(pairs, 2, 5);
    assert.equal(b.length, 10);
    assert.equal(b[0].n, 1);
    assert.equal(b[1].n, 2);
    assert.ok(Math.abs(b[1].meanPred! - 0.135) < 1e-12);
    assert.equal(b[1].observed, 0.5);
    assert.ok(Math.abs(b[1].gapPp! - 36.5) < 1e-9);
    assert.equal(b[1].flagged, true);
    assert.equal(b[9].n, 2);
    assert.equal(b[9].observed, 0.5);
    assert.equal(b[0].flagged, false); // n < min
    assert.equal(b[4].n, 0);
    assert.equal(b[4].meanPred, null);
  });

  it('flags only buckets with n >= min and |gap| > max; exactly 5pp passes', () => {
    const mk = (n: number, hits: number, p: number) =>
      Array.from({ length: n }, (_, i) => ({ p, hit: i < hits }));
    // p = 0.55, observed 0.60 => gap exactly +5pp (allow float noise via 0.6 vs 0.55).
    const ok = reliabilityBuckets(mk(100, 60, 0.55));
    assert.equal(ok[5].flagged, false);
    const bad = reliabilityBuckets(mk(100, 61, 0.55));
    assert.equal(bad[5].flagged, true);
    const small = reliabilityBuckets(mk(99, 99, 0.55));
    assert.equal(small[5].flagged, false);
  });
});

describe('bootstrap and non-overlapping', () => {
  it('is deterministic and brackets the point estimate', () => {
    const hits = Array.from({ length: 480 }, (_, i) => i % 10 !== 0);
    const a = blockBootstrapCoverage(hits, 24, 200, 1);
    const b = blockBootstrapCoverage(hits, 24, 200, 1);
    assert.deepEqual(a, b);
    assert.equal(a.mean, 0.9);
    assert.ok(a.lo <= 0.9 && a.hi >= 0.9);
  });

  it('nonOverlapping keeps origins at least T apart', () => {
    const rs = Array.from({ length: 100 }, (_, i) => ({ originIdx: i, T: 24 }) as OriginResult);
    const kept = nonOverlapping(rs);
    assert.deepEqual(
      kept.map((r) => r.originIdx),
      [0, 24, 48, 72, 96],
    );
  });
});

function bucket(over: Partial<ReliabilityBucket> = {}): ReliabilityBucket {
  return {
    lo: 0,
    hi: 0.1,
    n: 200,
    meanPred: 0.05,
    observed: 0.05,
    gapPp: 0,
    flagged: false,
    ...over,
  };
}

function report(
  asset: string,
  c90: number,
  c50: number,
  touchBad = false,
  closeBad = false,
): AssetReport {
  const ci = { mean: 0, lo: 0, hi: 0 };
  return {
    asset,
    horizon: 24,
    k: 1,
    nTrain: 1,
    nTest: 1,
    trainCoverage90: 0.9,
    band90: { coverage: c90, ci, daily: { n: 1, coverage: c90 } },
    band50: { coverage: c50, ci, daily: { n: 1, coverage: c50 } },
    touch: [bucket({ flagged: touchBad })],
    closeBeyond: [bucket({ flagged: closeBad })],
  };
}

describe('verdict', () => {
  it('A when everything passes (window edges inclusive)', () => {
    const v = verdict([report('BTC', 0.87, 0.54), report('ETH', 0.93, 0.46)]);
    assert.equal(v.verdict, 'A');
  });

  it('B when bands pass but a touch or close-beyond bucket fails', () => {
    assert.equal(verdict([report('BTC', 0.9, 0.5), report('ETH', 0.9, 0.5, true)]).verdict, 'B');
    assert.equal(verdict([report('BTC', 0.9, 0.5, false, true)]).verdict, 'B');
  });

  it('C when any asset fails a band, even if the reliability also fails', () => {
    assert.equal(verdict([report('BTC', 0.9, 0.5), report('SOL', 0.8, 0.5)]).verdict, 'C');
    assert.equal(verdict([report('BTC', 0.9, 0.55, true)]).verdict, 'C');
    assert.equal(verdict([report('BTC', 0.94, 0.5)]).verdict, 'C');
  });

  it('C for an empty report set; per-asset detail is returned', () => {
    assert.equal(verdict([]).verdict, 'C');
    const v = verdict([report('BTC', 0.9, 0.5, true)]);
    assert.deepEqual(v.perAsset[0], {
      asset: 'BTC',
      bandsPass: true,
      touchPass: false,
      closeBeyondPass: true,
    });
  });
});

describe('synthetic GBM sanity', () => {
  const series = candlesFromCloses(gbmCloses(30000, 0.005, 42));
  const rep = buildAssetReport('GBM', series, 24)!;

  it('k is ~1 for constant-vol zero-drift lognormal data', () => {
    assert.ok(Math.abs(rep.k - 1) < 0.1, `k = ${rep.k}`);
  });

  it('out-of-sample coverage is ~90% and ~50%', () => {
    assert.ok(Math.abs(rep.band90.coverage - 0.9) < 0.03, `90%: ${rep.band90.coverage}`);
    assert.ok(Math.abs(rep.band50.coverage - 0.5) < 0.04, `50%: ${rep.band50.coverage}`);
    assert.ok(Math.abs(rep.band90.daily.coverage - 0.9) < 0.06);
  });

  it('close-beyond reliability holds on well-populated buckets', () => {
    for (const b of rep.closeBeyond) {
      if (b.n >= 1000) assert.ok(Math.abs(b.gapPp!) < 6, `bucket ${b.lo}: ${b.gapPp}`);
    }
  });

  it('renders a markdown report with the verdict and per-asset tables', () => {
    const md = renderReport([rep], verdict([rep]));
    assert.match(md, /\*\*Verdict: [ABC]\*\*/);
    assert.match(md, /## GBM/);
    assert.match(md, /### Touch reliability/);
    assert.match(md, /### Close-beyond reliability/);
  });
});
