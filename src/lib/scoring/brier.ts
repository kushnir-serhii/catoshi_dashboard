/**
 * Multi-category Brier score (spec 011, functional-spec 2.3,
 * technical-considerations §3).
 *
 * Pure arithmetic — no database, no network.
 *
 *   BS = Σ (p_i − o_i)²   for i ∈ {bull, base, bear}
 *
 * where `p_i` are probabilities as fractions summing to 1 and `o_i` is 1 for the
 * realized scenario, 0 otherwise. Range 0 (perfect and confident) to 2 (confident
 * and wrong). The no-skill baseline (1/3, 1/3, 1/3) is 0.667 — see
 * `NO_SKILL_BRIER_BASELINE`, NOT the 0.25 binary form.
 */

import { PROBABILITY_SUM_TOLERANCE_PCT } from '@/consts/scoring';
import type { ScenarioProbabilities } from '@/data/types';

import type { RealizedScenario } from './realizedScenario';

const SCENARIOS = ['bull', 'base', 'bear'] as const;

/**
 * Non-100 probability sums (technical-considerations §7). DECISION:
 *
 *   - Input is accepted in **whole percentage points** — the stored shape of
 *     `ScenarioProbabilities` (`src/data/types.ts`), summing to ~100.
 *   - A sum within `100 ± PROBABILITY_SUM_TOLERANCE_PCT` is **normalised**:
 *     each value is divided by the actual total so the fractions sum to exactly
 *     1 before scoring. This absorbs rounding in the stored whole-number
 *     probabilities without letting it bias the score.
 *   - A sum **outside** that tolerance (or any negative / non-finite value, or a
 *     zero total) is **rejected** with a throw. It is never scored silently, and
 *     never coerced — a forecast whose probabilities do not add up is a bug in
 *     the forecast layer, not something to paper over here.
 */
export function brierScore(
  probabilities: ScenarioProbabilities,
  realized: RealizedScenario,
): number {
  const values = SCENARIOS.map((scenario) => probabilities[scenario]);

  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `brierScore: each probability must be finite and non-negative, got ${JSON.stringify(
          probabilities,
        )}`,
      );
    }
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    throw new Error('brierScore: probabilities sum to zero');
  }
  if (Math.abs(total - 100) > PROBABILITY_SUM_TOLERANCE_PCT) {
    throw new Error(
      `brierScore: probabilities sum to ${total}, outside 100 ± ${PROBABILITY_SUM_TOLERANCE_PCT} percentage points`,
    );
  }

  let score = 0;
  for (const scenario of SCENARIOS) {
    const fraction = probabilities[scenario] / total;
    const outcome = scenario === realized ? 1 : 0;
    score += (fraction - outcome) ** 2;
  }
  return score;
}
