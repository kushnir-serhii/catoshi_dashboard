import { COLLECT_ASSETS } from '@/consts/collect';

/**
 * Constants for spec 024 (Today Range & Level Probability).
 *
 * Every literal the zero-drift lognormal model (`src/lib/todayRange.ts`), the
 * `/api/today` route and the backtest depend on lives here, per the CLAUDE.md
 * constants rule (technical-considerations §2.2).
 */

/** Closed 1h bars used for realized volatility: 168 = 7 days. */
export const TODAY_VOL_BARS = 168;

/**
 * EWMA decay per hourly bar for the variance estimate. 0.98 gives a half-life of
 * ln(0.5) / ln(0.98) ≈ 34 hours, so the estimate leans on the last day or two
 * while still smoothing over the 7-day window.
 */
export const TODAY_EWMA_LAMBDA = 0.98;

/**
 * Per-asset scalar correction `k` applied to the EWMA volatility
 * (`σ_h = k · √v`). Keyed by CoinGecko id, the identifier `/api/today` takes,
 * and derived from `COLLECT_ASSETS` so the tracked set cannot drift from the
 * collector's. Defaults to 1.0 (no correction) until the Slice 1 backtest gate
 * fits it; when fitted, bump `TODAY_MODEL_VERSION`.
 */
export const TODAY_SIGMA_K: Readonly<Record<string, number>> = Object.fromEntries(
  COLLECT_ASSETS.map((asset) => [asset.coingeckoId, 1.0]),
);

/** Fewer closed 1h bars than this and the route answers `insufficient`, never a number. */
export const TODAY_MIN_BARS = 48;

/**
 * Age, in minutes, past which the newest 1h bar or the spot price is stale and
 * the route answers `stale`. Two hours tolerates one missed bar/refresh.
 */
export const TODAY_STALE_MINUTES = 120;

/**
 * Shortest horizon, in hours, the model will price. Below this the remaining
 * time is dominated by microstructure noise the hourly-σ model does not describe.
 */
export const TODAY_MIN_HORIZON_HOURS = 1;

/**
 * Version stamp stored with every prediction and returned by the API. Bump on
 * any change to the maths, the constants above or the fitted `k`, so the track
 * record never mixes rows produced by different models.
 */
export const TODAY_MODEL_VERSION = 1;

/* ---------------------------------------------------------------------------
 * Slice 1 calibration gate (technical-considerations §4). Used by
 * `src/lib/todayRangeEval.ts` and the backtest script.
 * ------------------------------------------------------------------------- */

/** Level offsets, in percent of spot, evaluated on both sides (±). */
export const TODAY_GATE_LEVEL_PCTS: readonly number[] = [0.5, 1, 2, 3, 5];

/** Fixed forecast horizon of the gate, in hours. */
export const TODAY_GATE_HORIZON_HOURS = 24;

/** Fraction of chronological origins used to fit `k`; the rest (after a gap) is the test split. */
export const TODAY_GATE_TRAIN_FRACTION = 0.7;

/** Nominal coverage of the wide band, the target `k` is fitted to. */
export const TODAY_GATE_FIT_COVERAGE = 0.9;

/** Pass window for 90% band coverage, out of sample. */
export const TODAY_GATE_BAND90_MIN = 0.87;
export const TODAY_GATE_BAND90_MAX = 0.93;

/** Pass window for 50% band coverage, out of sample. */
export const TODAY_GATE_BAND50_MIN = 0.46;
export const TODAY_GATE_BAND50_MAX = 0.54;

/** Reliability buckets are judged only with at least this many observations. */
export const TODAY_GATE_BUCKET_MIN_N = 100;

/** Max |observed - predicted| per judged reliability bucket, in percentage points. */
export const TODAY_GATE_BUCKET_MAX_GAP_PP = 5;

/** Block bootstrap: block length (hours) so 24h-overlapping origins stay together. */
export const TODAY_GATE_BOOTSTRAP_BLOCK = 24;
export const TODAY_GATE_BOOTSTRAP_ITERATIONS = 1000;
export const TODAY_GATE_BOOTSTRAP_SEED = 20240924;

/** `public.collector_status.source` key `/api/today` records each computation under (read back by `/api/health`). */
export const TODAY_COLLECTOR_SOURCE = 'today';

/** Route Handler cache window for `/api/today`, seconds. */
export const TODAY_REVALIDATE_SECONDS = 60;

/* ---------------------------------------------------------------------------
 * Slice 3 UI (functional-spec §2.1-2.5, technical-considerations §6).
 * ------------------------------------------------------------------------- */

/**
 * The §0 calibration verdict of the Slice 1 backtest (functional-spec §0).
 * `null` = the real backtest has not been run/recorded. Set to 'A' | 'B' | 'C'
 * from the spec once it is. Honoured by `resolveTodayGate`: 'A' ships the full
 * card, 'B' the band only, 'C' and `null` ship nothing in production.
 */
export const TODAY_GATE_VERDICT: 'A' | 'B' | 'C' | null = null;

/** Client poll interval for `useToday`, ms (matches the route's 60s cache). */
export const TODAY_REFRESH_INTERVAL_MS = 60_000;

/** Length of the rolling "Next 24h" horizon, hours. */
export const TODAY_NEXT_24H_HOURS = 24;

/** Default level offset, percent of spot, pre-filled when a coin is selected. */
export const TODAY_LEVEL_DEFAULT_PCT = 1;

/** Quick level chips, percent offsets relative to spot. */
export const TODAY_LEVEL_CHIP_PCTS: readonly number[] = [-2, -1, 1, 2];

/** The track-record line is shown only with at least this many resolved days. */
export const TODAY_MIN_TRACK_DAYS = 14;

/** Window, in days, the track-record line describes. */
export const TODAY_TRACK_WINDOW_DAYS = 30;

/** How often the panel re-reads the clock for "updated Ns ago" / time-left, ms. */
export const TODAY_CLOCK_TICK_MS = 15_000;

/* ---------------------------------------------------------------------------
 * Slice 4 daily scoring (technical-considerations §5).
 * ------------------------------------------------------------------------- */

/** Horizon of a stored daily prediction: `horizon_end = issued_at + this`. */
export const TODAY_SCORING_HORIZON_HOURS = 24;

/**
 * 1h bars fetched when resolving. 200 bars is ~8 days: a prediction whose window
 * is older than that (a long collector outage) stays unresolved rather than
 * being guessed at.
 */
export const TODAY_SCORING_KLINE_LIMIT = 200;

/** `SourceStatus.source` prefixes for the scoring stage (issue is suffixed with the asset symbol). */
export const TODAY_ISSUE_SOURCE = 'today:issue';
export const TODAY_RESOLVE_SOURCE = 'today:resolve';

/** Key of the scoring stage's group in the collect run's `sourcesBySymbol`. */
export const TODAY_SCORING_GROUP = 'todayScoring';
