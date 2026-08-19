import {
  DAYS_PER_YEAR,
  SCENARIO_DRIFT_FALLBACK,
  SCENARIO_DRIFT_MAX,
  SCENARIO_DRIFT_MIN,
  SCENARIO_MIN_HISTORY_POINTS,
  SCENARIO_PERCENTILE_Z,
  SCENARIO_VOL_FALLBACK,
  SCENARIO_VOL_MAX,
  SCENARIO_VOL_MIN,
} from '@/consts/scenario';
import type { HistoricalPrice } from '@/data/types';

/** Realized annualized volatility and drift measured from a coin's own price
 * history, expressed in percent so they can seed the sliders directly. */
export interface RealizedStats {
  /** Annualized standard deviation of daily log returns, in percent. */
  volPct: number;
  /** Annualized mean daily log return, in percent. */
  driftPct: number;
  /** False when history was too short to measure — the values are fallbacks. */
  isMeasured: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Daily log returns, skipping any non-positive or non-finite price pairs that
 * would make the logarithm undefined. */
function logReturns(prices: readonly HistoricalPrice[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].price;
    const curr = prices[i].price;
    if (prev > 0 && curr > 0) {
      const r = Math.log(curr / prev);
      if (Number.isFinite(r)) returns.push(r);
    }
  }
  return returns;
}

/**
 * Measures annualized volatility and drift from daily price history.
 *
 * Both are computed in log space, which is what the lognormal scenario model in
 * `projectScenarios` consumes: volatility is the sample standard deviation of
 * daily log returns scaled by √365, drift is their mean scaled by 365.
 *
 * Results are clamped to the slider bounds so a coin with an extreme year still
 * lands on a reachable starting position.
 */
export function computeRealizedStats(
  prices: readonly HistoricalPrice[] | undefined,
): RealizedStats {
  const fallback: RealizedStats = {
    volPct: SCENARIO_VOL_FALLBACK,
    driftPct: SCENARIO_DRIFT_FALLBACK,
    isMeasured: false,
  };

  if (!prices || prices.length < SCENARIO_MIN_HISTORY_POINTS) return fallback;

  const returns = logReturns(prices);
  if (returns.length < SCENARIO_MIN_HISTORY_POINTS) return fallback;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  // Sample variance (n-1) — these returns are a sample of the coin's behaviour,
  // not the whole population.
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);

  const volPct = Math.sqrt(variance * DAYS_PER_YEAR) * 100;
  const driftPct = mean * DAYS_PER_YEAR * 100;

  if (!Number.isFinite(volPct) || !Number.isFinite(driftPct)) return fallback;

  return {
    volPct: Math.round(clamp(volPct, SCENARIO_VOL_MIN, SCENARIO_VOL_MAX)),
    driftPct: Math.round(clamp(driftPct, SCENARIO_DRIFT_MIN, SCENARIO_DRIFT_MAX) * 2) / 2,
    isMeasured: true,
  };
}

export interface ScenarioOutcome {
  /** 5th-percentile price at the horizon. */
  bear: number;
  /** Median (50th-percentile) price at the horizon. */
  base: number;
  /** 95th-percentile price at the horizon. */
  bull: number;
}

/**
 * Projects bear/base/bull prices under a lognormal (geometric Brownian motion)
 * model, where `driftPct` is the annualized log drift μ and `volPct` the
 * annualized volatility σ:
 *
 *   median = S·exp(μt)
 *   p5/p95 = S·exp(μt ∓ z·σ·√t),  z = 1.645
 *
 * Using the 1.645 z-score (rather than ±1σ) is what makes the 5% / 50% / 95%
 * labels on the result cells literally correct.
 */
export function projectScenarios(
  startPrice: number,
  horizonDays: number,
  volPct: number,
  driftPct: number,
): ScenarioOutcome {
  const t = horizonDays / DAYS_PER_YEAR;
  const mu = driftPct / 100;
  const sigma = volPct / 100;

  const base = startPrice * Math.exp(mu * t);
  const spread = SCENARIO_PERCENTILE_Z * sigma * Math.sqrt(t);

  return {
    bear: base * Math.exp(-spread),
    base,
    bull: base * Math.exp(spread),
  };
}
