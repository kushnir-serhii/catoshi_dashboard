import { FORECAST_GRID_DAYS } from '@/consts/projections';
import type { ForecastPoint } from '@/data/types';

/**
 * Snaps a provider-returned scenario (bull/base/bear) array of {d,p} points onto the
 * canonical FORECAST_GRID_DAYS grid by nearest-day matching. Returns null if the input
 * is missing, empty, or too sparse to be a trustworthy fit (fewer than half the grid points).
 */
export function snapScenarioToGrid(
  points: Array<{ d: number; p: number }> | undefined,
): ForecastPoint[] | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length < FORECAST_GRID_DAYS.length / 2) return null;

  const result: ForecastPoint[] = [];
  for (const gridDay of FORECAST_GRID_DAYS) {
    let nearest = points[0];
    let nearestDist = Math.abs(points[0].d - gridDay);
    for (const point of points) {
      const dist = Math.abs(point.d - gridDay);
      if (dist < nearestDist) {
        nearest = point;
        nearestDist = dist;
      }
    }
    result.push({ d: gridDay, p: nearest.p });
  }

  return result;
}

/** Clamps to non-negative and rescales to sum to exactly 100, guarding against
 * a model returning scenario probabilities that don't add up cleanly. */
export function normalizeProbabilities(
  input: { bull: number; base: number; bear: number } | undefined,
): { bull: number; base: number; bear: number } {
  const bull = Math.max(0, input?.bull ?? 0);
  const base = Math.max(0, input?.base ?? 0);
  const bear = Math.max(0, input?.bear ?? 0);
  const total = bull + base + bear;
  if (total <= 0) return { bull: 0, base: 100, bear: 0 };
  const bullPct = Math.round((bull / total) * 100);
  const basePct = Math.round((base / total) * 100);
  return { bull: bullPct, base: basePct, bear: 100 - bullPct - basePct };
}
