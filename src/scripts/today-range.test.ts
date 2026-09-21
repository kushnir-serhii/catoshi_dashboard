/**
 * Pure-maths tests for spec 024 (technical-considerations §7).
 *
 * Run:  node --import tsx --test src/scripts/today-range.test.ts
 *
 * No database, no network, no clock reads: every input is a fixture.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TODAY_MIN_BARS, TODAY_SIGMA_K } from '@/consts/today';
import {
  closeBeyondProbability,
  ewmaSigmaHourly,
  hoursUntilLocalMidnight,
  normCdf,
  quantiles,
  scaledSigmaHourly,
  touchProbability,
} from '@/lib/todayRange';

const TOL = 1e-6;

function assertClose(actual: number, expected: number, tol = TOL, msg?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    msg ?? `expected ${actual} to be within ${tol} of ${expected}`,
  );
}

/** Build closes (oldest first) from a start price and a list of log returns. */
function closesFromReturns(returns: number[], start = 100): number[] {
  const closes = [start];
  for (const r of returns) closes.push(closes[closes.length - 1] * Math.exp(r));
  return closes;
}

const SPOT = 100;
const SIGMAS = [0.001, 0.005, 0.01, 0.03];
const HOURS = [1, 6, 12, 24];
const LOG_OFFSETS = [0, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.3];

describe('normCdf', () => {
  it('matches reference values', () => {
    assertClose(normCdf(0), 0.5);
    assertClose(normCdf(1.96), 0.9750021, TOL);
    assertClose(normCdf(-1.645), 0.0499849, TOL);
    assertClose(normCdf(1), 0.8413447, TOL);
  });

  it('is symmetric: Φ(-x) = 1 - Φ(x)', () => {
    for (const x of [0.1, 0.5, 1, 1.645, 2.5, 4]) {
      assertClose(normCdf(-x), 1 - normCdf(x), TOL);
    }
  });

  it('is monotone and bounded', () => {
    let prev = -1;
    for (let x = -6; x <= 6; x += 0.25) {
      const v = normCdf(x);
      assert.ok(v >= prev && v >= 0 && v <= 1);
      prev = v;
    }
  });
});

describe('quantiles', () => {
  const q = quantiles(SPOT, 0.01, 8);

  it('is symmetric in log space', () => {
    assertClose(Math.log(q.p95 / SPOT), -Math.log(q.p05 / SPOT), 1e-12);
    assertClose(Math.log(q.p75 / SPOT), -Math.log(q.p25 / SPOT), 1e-12);
  });

  it('is ordered p05 < p25 < p75 < p95 around spot', () => {
    assert.ok(q.p05 < q.p25 && q.p25 < q.p75 && q.p75 < q.p95);
    assert.ok(q.p25 < SPOT && SPOT < q.p75);
  });

  it('scales with sqrt(T) in log space', () => {
    const q4 = quantiles(SPOT, 0.01, 4);
    const q16 = quantiles(SPOT, 0.01, 16);
    assertClose(Math.log(q16.p95 / SPOT), 2 * Math.log(q4.p95 / SPOT), 1e-12);
    assertClose(Math.log(q16.p25 / SPOT), 2 * Math.log(q4.p25 / SPOT), 1e-12);
  });

  it('collapses to spot with zero sigma', () => {
    const z = quantiles(SPOT, 0, 8);
    assert.deepEqual([z.p05, z.p25, z.p75, z.p95], [SPOT, SPOT, SPOT, SPOT]);
  });
});

describe('touchProbability', () => {
  it('is exactly 1 at L = S', () => {
    for (const s of SIGMAS)
      for (const t of HOURS) assert.equal(touchProbability(SPOT, SPOT, s, t), 1);
  });

  it('is non-increasing as |ln(L/S)| grows, above and below spot', () => {
    for (const s of SIGMAS) {
      for (const t of HOURS) {
        for (const dir of [1, -1]) {
          let prev = Infinity;
          for (const off of LOG_OFFSETS) {
            const p = touchProbability(SPOT, SPOT * Math.exp(dir * off), s, t);
            assert.ok(p >= 0 && p <= 1);
            assert.ok(p <= prev + 1e-12, `not monotone: s=${s} t=${t} dir=${dir} off=${off}`);
            prev = p;
          }
        }
      }
    }
  });

  it('is symmetric in log distance', () => {
    assertClose(
      touchProbability(SPOT, SPOT * Math.exp(0.02), 0.01, 6),
      touchProbability(SPOT, SPOT * Math.exp(-0.02), 0.01, 6),
      1e-12,
    );
  });

  it('is at least the close-beyond probability', () => {
    for (const s of SIGMAS) {
      for (const t of HOURS) {
        for (const off of LOG_OFFSETS) {
          for (const dir of [1, -1]) {
            const level = SPOT * Math.exp(dir * off);
            assert.ok(
              touchProbability(SPOT, level, s, t) >=
                closeBeyondProbability(SPOT, level, s, t) - 1e-12,
            );
          }
        }
      }
    }
  });

  it('equals 2x the close-beyond probability when below the cap', () => {
    const level = SPOT * Math.exp(0.03);
    assertClose(
      touchProbability(SPOT, level, 0.01, 4),
      2 * closeBeyondProbability(SPOT, level, 0.01, 4),
      1e-12,
    );
  });

  it('stays <= 1 and approaches 1 for a level very close to spot', () => {
    const p = touchProbability(SPOT, SPOT * 1.000001, 0.05, 24);
    assert.ok(p <= 1 && p > 0.999);
  });

  it('degenerate sigma or T: 1 at spot, 0 elsewhere', () => {
    for (const [s, t] of [
      [0, 6],
      [0.01, 0],
      [0, 0],
    ]) {
      assert.equal(touchProbability(SPOT, SPOT, s, t), 1);
      assert.equal(touchProbability(SPOT, SPOT * 1.01, s, t), 0);
      assert.equal(touchProbability(SPOT, SPOT * 0.99, s, t), 0);
    }
  });
});

describe('closeBeyondProbability', () => {
  it('is 0.5 at L = S and non-increasing with distance, both sides', () => {
    assertClose(closeBeyondProbability(SPOT, SPOT, 0.01, 6), 0.5, TOL);
    for (const s of SIGMAS) {
      for (const t of HOURS) {
        for (const dir of [1, -1]) {
          let prev = Infinity;
          for (const off of LOG_OFFSETS) {
            const p = closeBeyondProbability(SPOT, SPOT * Math.exp(dir * off), s, t);
            assert.ok(p >= 0 && p <= 0.5 + 1e-9);
            assert.ok(p <= prev + 1e-12);
            prev = p;
          }
        }
      }
    }
  });

  it('matches the 95th percentile: P(beyond p95) ~ 5%', () => {
    const q = quantiles(SPOT, 0.01, 8);
    assertClose(closeBeyondProbability(SPOT, q.p95, 0.01, 8), 0.05, 1e-3);
    assertClose(closeBeyondProbability(SPOT, q.p05, 0.01, 8), 0.05, 1e-3);
  });

  it('degenerate sigma or T: 0.5 at spot, 0 elsewhere', () => {
    assert.equal(closeBeyondProbability(SPOT, SPOT, 0, 6), 0.5);
    assert.equal(closeBeyondProbability(SPOT, SPOT * 1.01, 0, 6), 0);
    assert.equal(closeBeyondProbability(SPOT, SPOT * 1.01, 0.01, 0), 0);
  });
});

describe('ewmaSigmaHourly', () => {
  it('constant-return series gives sigma == |r|', () => {
    for (const r of [0.002, -0.002, 0.01]) {
      const closes = closesFromReturns(new Array(100).fill(r));
      const sigma = ewmaSigmaHourly(closes);
      assert.ok(sigma !== null);
      assertClose(sigma, Math.abs(r), 1e-12);
    }
  });

  it('returns null below the minimum bars and a number at the boundary', () => {
    const returns = (n: number) => new Array(n).fill(0.001);
    // TODAY_MIN_BARS returns need TODAY_MIN_BARS + 1 closes.
    assert.equal(ewmaSigmaHourly(closesFromReturns(returns(TODAY_MIN_BARS - 1))), null);
    assert.ok(ewmaSigmaHourly(closesFromReturns(returns(TODAY_MIN_BARS))) !== null);
    assert.ok(ewmaSigmaHourly(closesFromReturns(returns(TODAY_MIN_BARS + 1))) !== null);
    // TODAY_MIN_BARS closes only give TODAY_MIN_BARS - 1 returns.
    assert.equal(ewmaSigmaHourly(new Array(TODAY_MIN_BARS).fill(100)), null);
  });

  it('returns null for empty or single-close input', () => {
    assert.equal(ewmaSigmaHourly([]), null);
    assert.equal(ewmaSigmaHourly([100]), null);
  });

  it('returns null on non-finite input', () => {
    const closes = closesFromReturns(new Array(100).fill(0.001));
    closes[50] = Number.NaN;
    assert.equal(ewmaSigmaHourly(closes), null);
  });

  it('weights a recent shock more than the same shock placed old', () => {
    const base = new Array(100).fill(0.001);
    const recent = [...base];
    recent[99] = 0.05;
    const old = [...base];
    old[0] = 0.05;
    const sRecent = ewmaSigmaHourly(closesFromReturns(recent));
    const sOld = ewmaSigmaHourly(closesFromReturns(old));
    assert.ok(sRecent !== null && sOld !== null);
    assert.ok(sRecent > sOld);
    assert.ok(sOld > 0.001);
  });

  it('respects the bars option (older returns are ignored)', () => {
    const returns = new Array(100).fill(0.001);
    returns[0] = 0.5; // outside the last 60
    const sigma = ewmaSigmaHourly(closesFromReturns(returns), { bars: 60 });
    assert.ok(sigma !== null);
    assertClose(sigma, 0.001, 1e-12);
  });
});

describe('scaledSigmaHourly', () => {
  it('applies k for a tracked asset', () => {
    const id = Object.keys(TODAY_SIGMA_K)[0];
    assert.ok(id !== undefined);
    const k = TODAY_SIGMA_K[id];
    assertClose(scaledSigmaHourly(0.01, id) as number, k * 0.01, 1e-15);
  });

  it('returns null for an untracked id', () => {
    assert.equal(scaledSigmaHourly(0.01, 'not-a-real-coin'), null);
  });
});

describe('hoursUntilLocalMidnight', () => {
  it('returns ~1 at 23:00 local', () => {
    assertClose(hoursUntilLocalMidnight(new Date(2026, 5, 15, 23, 0, 0)), 1, 1e-9);
  });

  it('returns ~24 just after local midnight', () => {
    assertClose(hoursUntilLocalMidnight(new Date(2026, 5, 15, 0, 0, 0)), 24, 1e-9);
  });

  it('is always in (0, 25] across a day of local times, including the last second', () => {
    for (let h = 0; h < 24; h += 1) {
      for (const [m, s] of [
        [0, 0],
        [30, 0],
        [59, 59],
      ]) {
        const v = hoursUntilLocalMidnight(new Date(2026, 2, 8, h, m, s));
        assert.ok(v > 0 && v <= 25, `h=${h} m=${m} s=${s} -> ${v}`);
      }
    }
  });
});
