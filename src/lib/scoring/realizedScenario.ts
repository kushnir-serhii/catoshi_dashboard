/**
 * Deciding which scenario "happened" (spec 011, functional-spec 2.2,
 * technical-considerations §3).
 *
 * Pure arithmetic — no database, no network. The rule is fixed in advance and
 * applied identically to every forecast so that the score measures the forecast,
 * not the scorer. Changing this rule later invalidates every stored score
 * (technical-considerations §8.2).
 */

import type { ForecastPoint } from '@/data/types';

/** Which of the three scenarios the realized price fell into. */
export type RealizedScenario = 'bull' | 'base' | 'bear';

/** The three predicted prices at one horizon. */
export interface ScenarioPrices {
  bull: number;
  base: number;
  bear: number;
}

/** The three per-scenario forecast curves. */
export interface ScenarioCurves {
  bull: readonly ForecastPoint[];
  base: readonly ForecastPoint[];
  bear: readonly ForecastPoint[];
}

/**
 * Predicted prices for each scenario at `horizonDays`.
 *
 * Sparse-horizon behaviour (technical-considerations §8.3): **skip**. The lookup
 * requires an exact `d === horizonDays` point on every scenario curve. If any
 * scenario has no point at that day, this returns `null` and the caller records
 * no outcome for that (forecast, horizon) — it does not substitute the nearest
 * available day. See `SPARSE_HORIZON_BEHAVIOUR` in `src/consts/scoring.ts`.
 */
export function scenarioPricesAtHorizon(
  curves: ScenarioCurves,
  horizonDays: number,
): ScenarioPrices | null {
  const priceAt = (points: readonly ForecastPoint[]): number | null => {
    const point = points.find((candidate) => candidate.d === horizonDays);
    return point ? point.p : null;
  };

  const bull = priceAt(curves.bull);
  const base = priceAt(curves.base);
  const bear = priceAt(curves.bear);

  if (bull === null || base === null || bear === null) {
    return null;
  }
  return { bull, base, bear };
}

/**
 * The realized scenario for an actual price against three predicted prices.
 *
 * The three predicted prices are sorted ascending — `bull > base > bear` is not
 * assumed, since nothing enforces it and an unsorted assumption is a silent
 * wrong answer on the day a curve crosses. The axis is then cut at the midpoints
 * between neighbours:
 *
 *   - above `midpoint(middle, highest)` → the highest band  → `bull`
 *   - below `midpoint(lowest, middle)`  → the lowest band   → `bear`
 *   - otherwise (including exactly on either boundary)       → `base`
 *
 * Returns `null` (unscoreable) when any two of the three predicted prices are
 * equal: the partition degenerates and a guess would be indistinguishable from a
 * measurement.
 */
export function realizedScenario(
  predicted: ScenarioPrices,
  actualPrice: number,
): RealizedScenario | null {
  const [lowest, middle, highest] = [predicted.bull, predicted.base, predicted.bear].toSorted(
    (a, b) => a - b,
  );

  if (lowest === middle || middle === highest) {
    return null;
  }

  const bearBoundary = (lowest + middle) / 2;
  const bullBoundary = (middle + highest) / 2;

  if (actualPrice > bullBoundary) {
    return 'bull';
  }
  if (actualPrice < bearBoundary) {
    return 'bear';
  }
  return 'base';
}
