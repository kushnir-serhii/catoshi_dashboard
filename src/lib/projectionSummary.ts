/**
 * Pure projection-summary maths shared by the AI predictions panel and the
 * watchlist strip (spec 021 §2.4). Extracted from the arithmetic previously
 * inline in `src/components/panels/AIPanel.tsx` so the two panels can never
 * disagree about the same coin. No React, no fetch — unit-tested in
 * `src/scripts/watchlist.test.ts`.
 */

import type { ProjectionData } from '@/data/types';
import { interpolateAt } from '@/lib/projectionSeries';

export interface ProjectionSummary {
  /** Projected % change of the base curve at the horizon, versus the
   * projection's own anchor price. */
  deltaPct: number;
  /** The AI's overall certainty for this forecast (0–100), passed through. */
  confidence: number;
}

/**
 * The base-curve price the forecast projects to at `horizonDays`, or `null`
 * when there is no projection or its anchor price is not positive (an
 * unusable forecast). Shared guard for both callers.
 */
export function projectedPriceAt(
  projection: ProjectionData | null,
  horizonDays: number,
): number | null {
  if (!projection || projection.currentPrice <= 0) return null;
  return interpolateAt(projection.base, horizonDays) ?? null;
}

/**
 * `null` is the single source of the dash and the empty confidence bar in
 * both panels — returned for a missing projection or a non-positive anchor
 * price.
 */
export function summariseProjection(
  projection: ProjectionData | null,
  horizonDays: number,
): ProjectionSummary | null {
  const target = projectedPriceAt(projection, horizonDays);
  if (target === null || !projection) return null;

  const deltaPct = ((target - projection.currentPrice) / projection.currentPrice) * 100;
  return { deltaPct, confidence: projection.confidence };
}
