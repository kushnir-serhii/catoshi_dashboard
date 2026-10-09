/**
 * Market Pulse compute constants (spec 027, Slice 4: Pulse compute + history).
 *
 * Every constant the Pulse score computation and history system uses lives here.
 * These values are ordered by technical §9, with prose-written default values
 * transcribed from technical §2.2. Computed values (e.g. PULSE_CONFLICT_MIN)
 * are derived and documented.
 */

import { SIGNALS_FRESHNESS_HOURS, TRACKED_COINS } from '@/consts/signals';
import type { PulseScope } from '@/data/types';

/**
 * Pulse model version. Bumped whenever the score formula, weights, or category
 * logic changes, so a re-backtest is visible in the record. Spec 027 initial
 * implementation: version 1.
 */
export const PULSE_MODEL_VERSION = 1;

/**
 * Category starting weights `W` (spec 027 technical §2.2). Per category and
 * side, `Σ(severity · decay · opinionFactor)` is first capped at
 * `PULSE_CATEGORY_CAP`, then multiplied by this weight.
 */
export const PULSE_WEIGHTS: Record<PulseCategory, number> = {
  flows: 1.2,
  derivatives: 1.0,
  macro: 1.0,
  news: 0.8,
  technical: 0.6,
  sentiment: 0.5,
} as const;

/**
 * Saturation constant of the index curve (spec 027 technical §2.3):
 * `index = round(100 · (1 − exp(−raw / PULSE_K)))`. With K = 3 one MEDIUM
 * signal (0.65 at weight 1) gives ~20; four MEDIUM across flows, derivatives,
 * macro and news give ~58.
 */
export const PULSE_K = 3;

/**
 * Per-category severity cap (spec 027 technical §2.2). No single category
 * contributes more than this much to the final bull or bear score,
 * preventing concentration. Default 2.0.
 */
export const PULSE_CATEGORY_CAP = 2.0;

/**
 * Conflict threshold on the 0..100 indices (spec 027 technical §2.3,
 * functional §2.1 default 50):
 * `conflict = bull ≥ PULSE_CONFLICT_MIN && bear ≥ PULSE_CONFLICT_MIN`.
 * One MEDIUM per side gives 19 / 19 (no Conflict); four MEDIUM per side across
 * flows, derivatives, macro and news gives 58 / 58 (Conflict), per technical
 * §2.2's worked example.
 */
export const PULSE_CONFLICT_MIN = 50;

/**
 * Minimum number of signal inputs required to compute a Pulse score.
 * Below this, the response is 'insufficient' rather than a numeric result.
 * Spec 027 technical §9.
 */
export const PULSE_MIN_INPUTS = 5;

/**
 * `opinionFactor` for news rows with `content_type = 'opinion'` (spec 027
 * technical §2.2); every other row uses 1. Default 0: opinion pieces still
 * count toward `PULSE_MIN_INPUTS` but do not move the bar.
 */
export const PULSE_OPINION_WEIGHT = 0;

/**
 * Pulse severity scale (spec 027 technical §2.2): the `severity` factor of one
 * signal's contribution. Stored severities are mapped onto these three levels
 * in one place, `toPulseSeverity` (src/lib/pulse/compute.ts).
 */
export const PULSE_SEVERITY: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 0.35,
  MEDIUM: 0.65,
  HIGH: 1.0,
} as const;

/**
 * Alert type after the severity pass. A Pulse produces one of these or no alert.
 */
export type PulseAlertType = 'bear_confluence' | 'bull_confluence' | 'conflict' | 'reversal';

/**
 * Signal category classification. Every signal input has a category that
 * determines which weight bucket it falls into. News rows have no rule_id;
 * they are classified as 'news' by the `kind` field in the signal row.
 */
export type PulseCategory = 'flows' | 'derivatives' | 'technical' | 'sentiment' | 'macro' | 'news';

/**
 * Rule ID → category map. Covers every rule id in the current rule set
 * (spec 027 technical §9). Macro rules from slice 3 are included. News
 * signals have no rule_id and are classified by the signal kind field.
 */
export const PULSE_RULE_CATEGORY: Record<string, PulseCategory> = {
  // Flows (ETF)
  etf_streak: 'flows',

  // Derivatives (funding, OI, long/short, flush/squeeze)
  funding_extreme: 'derivatives',
  funding_flip: 'derivatives',
  oi_surge: 'derivatives',
  long_flush: 'derivatives',
  short_squeeze: 'derivatives',
  long_short_extreme: 'derivatives',

  // Technical (RSI, MA, range, velocity, structure, volume, volatility)
  rsi_1d_overbought: 'technical',
  rsi_1d_oversold: 'technical',
  rsi_1h_extreme: 'technical',
  rsi_divergence_4h_1d: 'technical',
  ma_compression: 'technical',
  ma_cross_daily: 'technical',
  price_stretched_ma99: 'technical',
  range_break: 'technical',
  price_velocity: 'technical',
  volume_spike: 'technical',
  volatility_expansion: 'technical',
  structure_flip_daily: 'technical',

  // Sentiment (fear/greed)
  fear_greed_extreme: 'sentiment',
  sentiment_swing: 'sentiment',

  // Macro (FRED series readings)
  macro_brent: 'macro',
  macro_10y: 'macro',
  macro_dollar: 'macro',
} as const;

/**
 * Bucket bounds that map a stored market-state or macro severity (continuous
 * 0..1 from `severityFromDistance`, or a fixed rule value) onto
 * `PULSE_SEVERITY`: `< MEDIUM` → LOW, `< HIGH` → MEDIUM, otherwise HIGH.
 *
 * - MEDIUM 0.4: any fired rule is at least LOW. Fixed severities stay where the
 *   rules meant them: `RSI_1H_EXTREME_SEVERITY` 0.25 (a contrarian hint) lands
 *   in LOW, `SEVERITY_FIXED_MID` 0.5 lands in MEDIUM, both with margin.
 * - HIGH 0.8: a reading at least 80% of the rule's full severity span past its
 *   threshold, i.e. close to the point where the rule saturates at 1.
 *
 * News rows are not bucketed with these bounds: they use their classifier
 * magnitude, or the midpoints of `NEWS_MAGNITUDE_SEVERITY` when only the stored
 * number is known.
 */
export const PULSE_STATE_SEVERITY_BOUNDS = {
  MEDIUM: 0.4,
  HIGH: 0.8,
} as const;

/**
 * Factor applied to asset-scoped rows (BTC/ETH/SOL) in scope `market`
 * (spec 027 technical §2.1: "plus asset rows at half weight"). Applied per row
 * before the category cap.
 */
export const PULSE_MARKET_ASSET_FACTOR = 0.5;

/** Number of drivers kept per Pulse, ordered by |c| (spec 027 technical §2.4). */
export const PULSE_DRIVER_COUNT = 5;

/** Every scope the collect run computes and stores (one `market_pulse` row each). */
export const PULSE_SCOPES: readonly PulseScope[] = ['market', ...TRACKED_COINS];

/** Summary line budget (one sentence). */
export const PULSE_SUMMARY_MAX_CHARS = 140;

/** A driver label longer than this is cut with an ellipsis in the summary. */
export const PULSE_SUMMARY_LABEL_MAX_CHARS = 40;

/** Most driver labels named per side in the summary. */
export const PULSE_SUMMARY_PER_SIDE = 3;

/**
 * Minimum number of distinct categories on one side for a confluence alert
 * (spec 027 functional §2.7, technical §10: "≥ 4 distinct categories, not
 * 4 signals of one kind"). A category counts for a side when its capped,
 * weighted total on that side is ≥ `PULSE_ALERT_CATEGORY_MIN_C`. Default: 4.
 */
export const PULSE_ALERT_MIN_CATEGORIES = 4;

/**
 * Bear index (0..100, after the index curve) at or above which a
 * 'bear_confluence' alert can fire, together with `PULSE_ALERT_MIN_CATEGORIES`.
 * Default from spec 027 functional §2.7: 60.
 */
export const PULSE_ALERT_BEAR_MIN = 60;

/**
 * Bull index (0..100) at or above which a 'bull_confluence' alert can fire.
 * Functional §2.7 defines the bullish alert as the mirror of the bearish one,
 * so it starts equal to `PULSE_ALERT_BEAR_MIN`; kept separate so the two sides
 * can be tuned apart after the backtest.
 */
export const PULSE_ALERT_BULL_MIN = 60;

/**
 * Smallest capped, weighted category total (one side) that counts a category
 * as "live" for the confluence category count. Without it a news row decayed
 * to a few percent would count as a whole category. 0.05 sits below the
 * smallest undecayed contribution any row can make (LOW 0.35 × market asset
 * factor 0.5 × sentiment weight 0.5 ≈ 0.088), so only decayed tails drop out.
 */
export const PULSE_ALERT_CATEGORY_MIN_C = 0.05;

/**
 * Points the Pulse value (bull − bear, −100..+100) must move between the point
 * nearest t − 24h (within `PULSE_PREV24H_TOLERANCE_HOURS`) and now for a
 * 'reversal' alert (functional §2.7). Inclusive: exactly 40 fires. Default: 40.
 */
export const PULSE_REVERSAL_POINTS = 40;

/** At most one alert per (scope, type) within this many hours (functional §2.7). */
export const PULSE_ALERT_DEDUPE_HOURS = 24;

/**
 * Largest gap (hours) between the current Pulse point and the previous one for
 * the previous point to count as the baseline of a Conflict "enter". With a
 * longer gap the state in between is unknown, so no enter is declared. Equals
 * `SIGNALS_FRESHNESS_HOURS` (3): tolerates two missed hourly runs, the same
 * budget after which the API calls the Pulse stale.
 */
export const PULSE_ALERT_PREV_MAX_GAP_HOURS = SIGNALS_FRESHNESS_HOURS;

/**
 * Open-interest percentage drop threshold for long_flush/short_squeeze detection.
 * Shared with the signal rules (`src/consts/signals.ts`); see note below.
 *
 * Note: This constant ALREADY EXISTS in `src/consts/signals.ts` as
 * `PULSE_OI_FLUSH_PCT`. Do NOT modify or duplicate it here — it is defined
 * once in signals.ts and imported there for signal rules. This codebase avoids
 * redundant definitions per CLAUDE.md (constants rule, §1.5).
 */
// export const PULSE_OI_FLUSH_PCT = 3; // ← Defined in src/consts/signals.ts

/**
 * Price percentage move threshold for long_flush/short_squeeze detection.
 * Shared with the signal rules (`src/consts/signals.ts`); see note below.
 *
 * Note: This constant ALREADY EXISTS in `src/consts/signals.ts` as
 * `PULSE_PRICE_FLUSH_PCT`. Do NOT modify or duplicate it here — it is defined
 * once in signals.ts and imported there for signal rules. This codebase avoids
 * redundant definitions per CLAUDE.md (constants rule, §1.5).
 */
// export const PULSE_PRICE_FLUSH_PCT = 2; // ← Defined in src/consts/signals.ts

/**
 * Zone threshold: minimum percentage difference between open-interest level and
 * a reference band. Used to detect when OI is entering an extreme zone.
 * Default: 20 (%).
 */
export const PULSE_ZONE_THRESHOLD = 20;

/**
 * Category → per-asset or global collector sources that, when all failing,
 * make that category unavailable on the Pulse card. Used to detect and report
 * partial outages (e.g., "news (2/3 feeds)" when one feed dies).
 *
 * Each category is mapped to either:
 * - `{ global: [...] }` — global sources (unprefixed) used for all scopes.
 * - `{ perAsset: [...] }` — collector suffixes (e.g., 'funding') resolved as
 *   `${symbol}:${suffix}` per asset at compute time. For an asset scope use
 *   that asset's sources; for scope market, a category is missing only when
 *   it fails for ALL tracked assets that support it (SOL has no etfFlows, so
 *   the flows category is missing only if BTC and ETH both fail).
 *
 * Collector sources are found in `src/lib/snapshotBuilder.ts` via the per-asset
 * snapshot build (e.g., 'klines', 'funding', 'etfFlows'). These names are
 * stored in `collector_status.source` as `${symbol}:${suffix}`.
 *
 * Note: `snapshotBuilder` failing (no klines at all) means no snapshot can be
 * written — a whole-Pulse fatal problem, not a category-level one. It is
 * excluded from this map; failures are surfaced at the top level.
 *
 * News is marked partial when only some feeds fail: "news (k/3 feeds)",
 * where k is the number of feeds still working.
 */
export const PULSE_CATEGORY_COLLECTOR: Record<
  PulseCategory,
  { global: string[] } | { perAsset: string[] }
> = {
  news: { global: ['news:coindesk', 'news:cointelegraph', 'news:decrypt'] },
  macro: { global: ['macro'] },
  flows: { perAsset: ['etfFlows'] },
  derivatives: { perAsset: ['funding', 'openInterest', 'longShortRatio'] },
  technical: { perAsset: ['klines'] },
  sentiment: { perAsset: ['fearGreed'] },
} as const;

/**
 * Staleness tolerance (hours) when checking if a previous 24h Pulse is still
 * usable for the `prev24h` field. A Pulse older than this is not returned as
 * the comparison baseline; instead `prev24h` is null.
 */
export const PULSE_PREV24H_TOLERANCE_HOURS = 2;

/**
 * Backtest sample count (n): number of alerts per scope and alert type that
 * were evaluated in the most recent backtest (spec 027 technical §8). Used in
 * the message prefix "Unvalidated (backtest n = <n>)" to indicate the Pulse
 * is using a model that has not yet been validated against live price action.
 *
 * Populated after each backtest run; empty initially. Keys are scope and alert
 * type; values are the alert counts used in the validation (e.g., 47 bear
 * confluences on the market scope).
 *
 * Example after a backtest:
 *   { market: { bear_confluence: 47, bull_confluence: 52, ... }, ... }
 */
export const PULSE_BACKTEST_N: Partial<
  Record<PulseScope, Partial<Record<PulseAlertType, number>>>
> = {
  market: { bear_confluence: 0, bull_confluence: 0, conflict: 0, reversal: 0 },
  BTC: { bear_confluence: 0, bull_confluence: 0, conflict: 0, reversal: 0 },
  ETH: { bear_confluence: 0, bull_confluence: 0, conflict: 0, reversal: 0 },
  SOL: { bear_confluence: 0, bull_confluence: 0, conflict: 0, reversal: 0 },
};

/** Backtest outcome window (functional §2.8): any 1h close within this many hours. */
export const PULSE_BACKTEST_HORIZON_HOURS = 72;

/** Backtest outcome move (functional §2.8): a close at least this % beyond the alert close. */
export const PULSE_BACKTEST_MOVE_PCT = 5;

/** Qualifying alerts per scope and type below which the verdict is B (functional §2.8). */
export const PULSE_BACKTEST_MIN_ALERTS = 10;

/** One-sided binomial p-value below which a type beats its base rate (Verdict A). */
export const PULSE_BACKTEST_P_MAX = 0.1;

/** Asset whose price scores the `market` scope (functional §2.8: "`market` uses BTC"). */
export const PULSE_BACKTEST_MARKET_ASSET = 'BTC';

/**
 * Age (hours) of the latest stored Pulse row past which `/api/pulse` answers
 * `stale` instead of `ok` (spec 027 functional §2.2: "Newest pulse row older
 * than SIGNALS_FRESHNESS_HOURS | The bar greyed out with 'Stale: last computed
 * <time>'"). Tolerates two missed hourly collection runs.
 */
export const PULSE_STALE_HOURS = SIGNALS_FRESHNESS_HOURS;

/**
 * How long the highlight ring stays on a card after a Pulse driver chip jumps
 * to it (spec 027 technical §7: "a 2s highlight ring").
 */
export const PULSE_HIGHLIGHT_MS = 2000;

/** Backtest verdict gate for notifications (spec 027 technical §8). */
export type PulseNotifyVerdict = 'A' | 'B' | 'C';

/**
 * Env names of the Telegram notifier (spec 027 technical §8). Read by the live
 * notifier and by the `pulse-telegram-test` script, so they live here once.
 * `PULSE_NOTIFY_VERDICT` unset (or C) = notifications off.
 */
export const PULSE_NOTIFY_ENV = {
  token: 'TELEGRAM_BOT_TOKEN',
  chatId: 'TELEGRAM_CHAT_ID',
  baseUrl: 'APP_BASE_URL',
  verdict: 'PULSE_NOTIFY_VERDICT',
} as const;

/** Hard timeout (ms) of one Telegram `sendMessage` call. */
export const TELEGRAM_FETCH_TIMEOUT_MS = 5000;

/** Telegram Bot API origin. */
export const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

/** Most drivers named in an alert message. */
export const PULSE_ALERT_MESSAGE_DRIVERS = 3;

/**
 * History window (hours) loaded for the reversal (24h ± tolerance) and Conflict
 * entry (previous point) lookbacks.
 */
export const PULSE_NOTIFY_HISTORY_HOURS = 26;

/** `collector_status` source of the Telegram step. */
export const TELEGRAM_STATUS_SOURCE = 'telegram';
