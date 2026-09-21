/**
 * Zero-drift lognormal range and level model (spec 024, technical-considerations §2).
 *
 * Pure maths — no database, no network, no clock reads. Imported by both the
 * `/api/today` route and the client, so there is exactly one code path.
 *
 * ZERO DRIFT: the model assumes μ = 0. Direction is not claimed (functional
 * spec §1); any non-zero drift would be a direction claim smuggled in through a
 * parameter. The output is a *range* and *level probabilities*, symmetric in log
 * space around the live spot.
 *
 *   σ_T          = σ_h · √T                       (T in fractional hours)
 *   quantile q   = S · exp(z_q · σ_T)
 *   close beyond = 1 − Φ(|ln(L/S)| / σ_T)
 *   touch        = min(1, 2 · (1 − Φ(|ln(L/S)| / σ_T)))   (reflection principle)
 *
 * Continuous-monitoring touch slightly overstates hourly-sampled touches and
 * understates fat-tail jumps. The per-asset `k` (`TODAY_SIGMA_K`) and the
 * backtest gate absorb this; no ad-hoc fudge factors belong in this file.
 */

import { TODAY_EWMA_LAMBDA, TODAY_MIN_BARS, TODAY_SIGMA_K, TODAY_VOL_BARS } from '@/consts/today';

/** Standard normal z-scores for the 5th / 25th / 75th / 95th percentiles. */
const Z_P05 = -1.645;
const Z_P25 = -0.674;
const Z_P75 = 0.674;
const Z_P95 = 1.645;

export interface TodayQuantiles {
  p05: number;
  p25: number;
  p75: number;
  p95: number;
}

export interface EwmaOptions {
  /** Number of most recent 1h returns to use. Defaults to `TODAY_VOL_BARS`. */
  bars?: number;
  /** Per-bar decay. Defaults to `TODAY_EWMA_LAMBDA`. */
  lambda?: number;
  /** Minimum returns required. Defaults to `TODAY_MIN_BARS`. */
  minBars?: number;
}

/** Log returns `ln(c_i / c_{i-1})`; the result has `closes.length - 1` entries (empty if < 2 closes). */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/**
 * RAW hourly sigma (no `k` applied): √v with v = Σ w_i r_i², w_i ∝ λ^age
 * (newest return has age 0), weights normalised to sum 1, mean assumed zero.
 *
 * Uses the last `bars` returns of the closed 1h `closes` (oldest first). Returns
 * `null` when fewer than `minBars` returns are available or any return is
 * non-finite (bad input), which the API maps to `unavailable: insufficient`.
 * Apply the per-asset correction with `scaledSigmaHourly`.
 */
export function ewmaSigmaHourly(closes: number[], opts: EwmaOptions = {}): number | null {
  const bars = opts.bars ?? TODAY_VOL_BARS;
  const lambda = opts.lambda ?? TODAY_EWMA_LAMBDA;
  const minBars = opts.minBars ?? TODAY_MIN_BARS;

  const returns = logReturns(closes).slice(-bars);
  if (returns.length < minBars || returns.length === 0) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < returns.length; i += 1) {
    const age = returns.length - 1 - i;
    const weight = lambda ** age;
    weightedSum += weight * returns[i] * returns[i];
    weightTotal += weight;
  }
  const variance = weightedSum / weightTotal;
  return Number.isFinite(variance) ? Math.sqrt(variance) : null;
}

/**
 * Applies the per-asset scalar `k = TODAY_SIGMA_K[assetId]` (σ_h = k · √v).
 * `assetId` is the CoinGecko id. An untracked asset has no `k`, so this returns
 * `null` rather than guessing 1.0 (the route maps that to `untracked`).
 */
export function scaledSigmaHourly(rawSigma: number, assetId: string): number | null {
  const k = TODAY_SIGMA_K[assetId];
  return k === undefined ? null : k * rawSigma;
}

/** Standard normal CDF Φ(x), Abramowitz–Stegun 7.1.26 erf approximation (abs. error < ~1.5e-7). */
export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // erf(z) with z = |x| / √2, using the sign symmetry of erf.
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const erfAbs = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + (x < 0 ? -erfAbs : erfAbs));
}

/** p05 / p25 / p75 / p95 of the price after `hoursT` hours: `spot · exp(z · σ_h · √T)`. */
export function quantiles(spot: number, sigmaHourly: number, hoursT: number): TodayQuantiles {
  const sigmaT = sigmaHourly * Math.sqrt(hoursT);
  return {
    p05: spot * Math.exp(Z_P05 * sigmaT),
    p25: spot * Math.exp(Z_P25 * sigmaT),
    p75: spot * Math.exp(Z_P75 * sigmaT),
    p95: spot * Math.exp(Z_P95 * sigmaT),
  };
}

/**
 * Shared tail term `1 − Φ(|ln(L/S)| / σ_T)`. Returns `null` when the inputs are
 * degenerate (σ_T <= 0 or non-finite), and `NaN`-safe for non-positive prices.
 */
function tailProbability(
  spot: number,
  level: number,
  sigmaHourly: number,
  hoursT: number,
): number | null {
  const sigmaT = sigmaHourly * Math.sqrt(hoursT);
  if (!(sigmaT > 0) || !Number.isFinite(sigmaT)) return null;
  return 1 - normCdf(Math.abs(Math.log(level / spot)) / sigmaT);
}

/**
 * Probability the price at time T is beyond `level` (above it if L > S, below it
 * if L < S): `1 − Φ(|ln(L/S)| / σ_T)`.
 *
 * Degenerate σ_T <= 0 or T <= 0 (no time or no volatility left): the price cannot
 * move, so return 0 for L != S. For L == S the formula gives 1 − Φ(0) = 0.5 and
 * the degenerate case returns the same 0.5 for continuity.
 */
export function closeBeyondProbability(
  spot: number,
  level: number,
  sigmaHourly: number,
  hoursT: number,
): number {
  const tail = tailProbability(spot, level, sigmaHourly, hoursT);
  if (tail === null) return level === spot ? 0.5 : 0;
  return tail;
}

/**
 * Probability the price touches `level` at any time before T (zero drift,
 * reflection principle): `min(1, 2 · (1 − Φ(|ln(L/S)| / σ_T)))`. Exactly 1 when
 * L == S.
 *
 * Degenerate σ_T <= 0 or T <= 0: the price cannot move, so the level is touched
 * only if it already equals spot — 1 when L == S, else 0.
 */
export function touchProbability(
  spot: number,
  level: number,
  sigmaHourly: number,
  hoursT: number,
): number {
  if (level === spot) return 1;
  const tail = tailProbability(spot, level, sigmaHourly, hoursT);
  if (tail === null) return 0;
  return Math.min(1, 2 * tail);
}

/**
 * Fractional hours from `now` until the viewer's next local 00:00. Uses the
 * local-time `Date` constructor to build the actual next-midnight timestamp, so
 * 23h and 25h DST days are handled (never `24 - hours`).
 */
export function hoursUntilLocalMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (nextMidnight.getTime() - now.getTime()) / 3_600_000;
}
