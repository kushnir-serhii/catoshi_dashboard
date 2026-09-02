/**
 * Severity helpers shared by the rules. Severity is crude on purpose
 * (technical-considerations §4): it orders cards, it is not a model.
 */

/** Clamp to 0..1. `NaN` (e.g. a 0/0 span) collapses to 0. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Severity as normalised distance past a threshold.
 *
 * @param distancePast how far the reading sits beyond the threshold, in the
 *   reading's own units (must be measured so that a stronger signal is larger).
 * @param span the distance beyond the threshold that maps to full severity (1).
 */
export function severityFromDistance(distancePast: number, span: number): number {
  return clamp01(distancePast / span);
}
