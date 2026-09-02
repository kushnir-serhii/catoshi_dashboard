/**
 * Constants for spec 011 (Forecast Scoring and the Models Explorer).
 *
 * Every literal the scoring maths and the Models page depend on lives here, per
 * the CLAUDE.md constants rule — `brier.ts`, `realizedScenario.ts`, the resolver
 * and the test all import from this module rather than inlining a number.
 */

/**
 * Horizons (days from `as_of`) a forecast curve is scored at. A forecast is a
 * curve, not a single call, so each horizon is resolved independently
 * (functional-spec 2.1).
 *
 * Every value here must be a day the forecast grid actually generates
 * (`FORECAST_GRID_DAYS` in `src/consts/projections.ts`) — 1, 7 and 30 all sit on
 * the daily part of that grid, so the predicted price at each is a lookup, never
 * an interpolation (technical-considerations §1.4).
 */
export const SCORED_HORIZON_DAYS: readonly number[] = [1, 7, 30];

/**
 * Sparse-horizon behaviour (technical-considerations §8.3). DECISION: **skip**.
 *
 * When a forecast curve has no point at the horizon being scored, that
 * (forecast, horizon) pair is left unresolved — no outcome row, no score. We do
 * NOT fall back to the nearest available day: a day-6 price stood in for a day-7
 * horizon is a quiet wrong answer, and the whole point of this spec is to stop
 * measurements that are really guesses. Because 1/7/30 are all on the dense
 * daily part of the generated grid, a miss here means a malformed or truncated
 * curve, which should be skipped rather than patched.
 *
 * This flag records the decision in code; `scenarioPricesAtHorizon` in
 * `src/lib/scoring/realizedScenario.ts` implements it by returning `null` when
 * any scenario lacks a point at the exact horizon.
 */
export const SPARSE_HORIZON_BEHAVIOUR = 'skip' as const;

/**
 * No-skill baseline for the multi-category Brier score (technical-considerations
 * §3). A forecaster answering 1/3, 1/3, 1/3 scores
 * `(1/3 − 1)² + (1/3)² + (1/3)² = 0.667`. This is NOT the 0.25 binary-Brier
 * baseline — see spec Slice 6. Every reported score is shown against this
 * (functional-spec 2.8).
 */
export const NO_SKILL_BRIER_BASELINE = 0.667;

/** Best (0) and worst (fully confident and wrong) possible Brier values. */
export const BRIER_MIN = 0;
export const BRIER_MAX = 2;

/**
 * Age limit on the forecast → snapshot link (functional-spec 2.6). Collection
 * runs hourly; a snapshot older than this is not "conditions that were actually
 * current", so the forecast is recorded with `snapshot_id = null` instead.
 * 90 minutes tolerates one missed hourly run without linking stale conditions.
 */
export const FORECAST_SNAPSHOT_MAX_AGE_MINUTES = 90;

/**
 * Resolution price tolerance (spec 011, Slice 4). When the resolver looks up the
 * market price at `as_of` (entry price) or at `as_of + horizon_days` (actual
 * price at the horizon), the nearest available price point — a stored snapshot
 * or a CoinGecko daily close — must sit within this many hours of the target
 * timestamp. Collection is hourly and CoinGecko's fallback series is daily, so
 * 26 hours tolerates one missed hourly run plus a day-boundary gap without
 * silently scoring against a price from the wrong day.
 */
export const RESOLUTION_PRICE_MAX_GAP_HOURS = 26;

/**
 * Minimum number of scoreable outcomes behind an aggregate before the Models
 * page reports a mean score rather than its explicit insufficient-data state
 * (functional-spec 2.7, technical-considerations §6, §8.4). Below this, a mean is
 * noise presented as fact.
 */
export const MIN_SCORED_SAMPLE_SIZE = 30;

/**
 * Tolerance, in percentage points, on the sum of `ScenarioProbabilities`.
 * `brier.ts` accepts probabilities in whole percentage points (the stored shape,
 * `src/data/types.ts`); a sum within 100 ± this is normalised to fractions
 * summing to 1, a sum outside it is rejected — never scored silently
 * (technical-considerations §7).
 */
export const PROBABILITY_SUM_TOLERANCE_PCT = 1;
