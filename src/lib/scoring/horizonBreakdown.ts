/**
 * Per-horizon accuracy breakdown for the Models page (spec 026, technical-considerations §2.3).
 *
 * Pure: turns the sparse rows from `calibration_scores_by_horizon` into exactly one
 * entry per scored horizon, and decides each entry's display state. The "never show a
 * score below MIN_SCORED_SAMPLE_SIZE" rule lives here so it is unit-tested, not buried in JSX.
 */

import {
  MIN_SCORED_SAMPLE_SIZE,
  NO_SKILL_BRIER_BASELINE,
  SCORED_HORIZON_DAYS,
} from '@/consts/scoring';
import type { ModelHorizonScore } from '@/data/types';

export type HorizonEntry =
  | {
      state: 'scored';
      horizonDays: number;
      scoredCount: number;
      meanBrier: number;
      /** True when meanBrier is below the no-skill baseline (lower Brier is better). */
      beating: boolean;
      /** Absolute gap to the baseline. */
      delta: number;
    }
  | {
      state: 'insufficient';
      horizonDays: number;
      scoredCount: number;
    };

/** `1 -> "1 day"`, `n -> "n days"`. */
export function horizonLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** Exactly one entry per `SCORED_HORIZON_DAYS` value, in that order. */
export function buildHorizonBreakdown(byHorizon: readonly ModelHorizonScore[]): HorizonEntry[] {
  return SCORED_HORIZON_DAYS.map((horizonDays): HorizonEntry => {
    const row = byHorizon.find((r) => r.horizonDays === horizonDays);
    const scoredCount = row?.scoredCount ?? 0;
    const meanBrier = row?.meanBrier ?? null;

    if (scoredCount >= MIN_SCORED_SAMPLE_SIZE && meanBrier !== null) {
      return {
        state: 'scored',
        horizonDays,
        scoredCount,
        meanBrier,
        beating: meanBrier < NO_SKILL_BRIER_BASELINE,
        delta: Math.abs(NO_SKILL_BRIER_BASELINE - meanBrier),
      };
    }
    return { state: 'insufficient', horizonDays, scoredCount };
  });
}

/** Early-state line, e.g. `"1 day: 14 · 7 days: 9 · 30 days: 0"`. */
export function formatHorizonCounts(entries: readonly HorizonEntry[]): string {
  return entries.map((e) => `${horizonLabel(e.horizonDays)}: ${e.scoredCount}`).join(' · ');
}
