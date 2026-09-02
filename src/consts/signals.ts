/**
 * Assets the Signals feature covers. Kept in lock-step with `COLLECT_ASSETS`
 * (`src/consts/collect.ts`): a signal can only ever be about an asset that has
 * snapshot rows, so this list must not advertise assets the collector never
 * touches (functional-spec 2.5, technical-considerations §1.8).
 */
export const TRACKED_COINS = ['BTC', 'ETH', 'SOL'] as const;

/**
 * Maximum number of signal cards the feed shows, and the `limit` applied to the
 * signals read query (slice 5). One value used by both the API and the UI, so
 * per the CLAUDE.md constants rule it lives here rather than being hardcoded as
 * `limit 20` in the route (technical-considerations §1.6).
 */
export const SIGNALS_COUNT = 6;

export const SIGNALS_REFRESH_INTERVAL_MS = 60_000;

/**
 * Cadence of the snapshot collection run (GitHub Actions `schedule: '0 * * * *'`).
 * Used to derive `nextUpdate` from the newest snapshot's `ts`.
 */
export const SIGNALS_COLLECTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Freshness window for the feed (technical-considerations §3). A signal derived
 * from a snapshot older than this never appears, even if that leaves fewer than
 * `SIGNALS_COUNT` cards. Three hours tolerates two missed best-effort hourly
 * runs while keeping "current" honest.
 */
export const SIGNALS_FRESHNESS_HOURS = 3;

/* ------------------------------------------------------------------------- *
 * Rule thresholds (technical-considerations §4).
 *
 * These are picked conventions, not calibrated values (§8.4) — once spec 011's
 * scoring exists they become measurable. Every threshold a rule needs lives
 * here; none are inlined in `src/lib/signals/rules/` (CLAUDE.md constants rule).
 *
 * Boundary behaviour follows the §4 table exactly: `>=` / `<=`, not strict.
 * ------------------------------------------------------------------------- */

/** `rsi_1d_overbought` fires when daily RSI `>=` this. */
export const RSI_OVERBOUGHT = 70;
/** `rsi_1d_oversold` fires when daily RSI `<=` this. */
export const RSI_OVERSOLD = 30;
/** Midline that 4h and daily RSI must sit on opposite sides of for `rsi_divergence_4h_1d`. */
export const RSI_MIDLINE = 50;
/** RSI points past the overbought/oversold line that map to full severity (RSI 85 outranks RSI 71). */
export const RSI_SEVERITY_SPAN = 15;

/**
 * `funding_extreme` fires when |funding rate| `>=` this. Binance `lastFundingRate`
 * is a per-8h fraction, so 0.0005 is 5 bps / 8h — roughly 0.15%/day, well above
 * the ~0.01% neutral resting rate.
 */
export const FUNDING_EXTREME_RATE = 0.0005;
/** Funding-rate distance past the extreme line that maps to full severity. */
export const FUNDING_SEVERITY_SPAN = 0.0005;
/**
 * `funding_flip` ignores a sign change when both readings sit within this of
 * zero — a wobble across zero at 0.1 bps is noise, not "traders switching side".
 */
export const FUNDING_FLIP_MIN_RATE = 0.00005;

/** `oi_surge` fires when 24h open-interest change (%) `>=` this. */
export const OI_SURGE_CHANGE_PCT = 15;
/**
 * …and the price move between the previous and current snapshot stays within
 * this (%) — the "price roughly flat" half of the rule. The snapshot cadence is
 * hourly, so this is a 1h flat check standing in for the §4 table's "24h"; the
 * 24h OI number is genuine, the flatness proxy is the best the store offers.
 */
export const OI_SURGE_PRICE_FLAT_PCT = 1;
/** OI-change points past threshold that map to full severity. */
export const OI_SURGE_SEVERITY_SPAN = 15;

/** `etf_streak` fires at this many consecutive same-sign ETF net-flow days. */
export const ETF_STREAK_DAYS = 5;
/** Streak days past threshold that map to full severity. */
export const ETF_STREAK_SEVERITY_SPAN = 5;

/** `volume_spike` fires when the daily volume z-score `>=` this. */
export const VOLUME_SPIKE_Z = 2;
/** Z-score distance past threshold that maps to full severity. */
export const VOLUME_SPIKE_SEVERITY_SPAN = 2;

/**
 * `ma_compression` fires when |MA7 - MA25| / |MA25| * 100 `<=` this (%), read on
 * the 4h timeframe (the one that mattered in forecast-journal miss #4).
 */
export const MA_COMPRESSION_PCT = 0.5;

/** `fear_greed_extreme` fires when the index `<=` this (extreme fear). */
export const FEAR_GREED_FEAR = 20;
/** …or `>=` this (extreme greed). */
export const FEAR_GREED_GREED = 80;
/** Index points past either threshold that map to full severity. */
export const FEAR_GREED_SEVERITY_SPAN = 20;

/**
 * Severity returned by rules with no natural scale (`rsi_divergence_4h_1d`,
 * `funding_flip`) — this is card ordering, not a model (technical-considerations §4).
 */
export const SEVERITY_FIXED_MID = 0.5;

/* ------------------------------------------------------------------------- *
 * Second rule set.
 *
 * Added after the first live run produced only four signals across three
 * assets. Every rule below reads a snapshot field that no earlier rule touched,
 * so the additions widen coverage rather than restating what already fires.
 * The feed is still capped at `SIGNALS_COUNT` and ordered by severity, so more
 * rules raise the chance the page has something true to say without making it
 * longer.
 * ------------------------------------------------------------------------- */

/** `long_short_extreme`: fires when the long/short account ratio `>=` this. */
export const LONG_SHORT_LONG_HEAVY = 2;
/** …or `<=` this. 0.5 is the exact mirror of 2 on a log scale. */
export const LONG_SHORT_SHORT_HEAVY = 0.5;
/**
 * Severity span for `long_short_extreme`, in natural-log units of the ratio.
 * 0.69 ≈ ln(2), so a further doubling past the threshold reaches full severity.
 * Logs are used so that 4.0 and 0.25 score identically — on a raw scale the
 * long side would always dominate, since it is unbounded above and the short
 * side is squeezed into 0..0.5.
 */
export const LONG_SHORT_SEVERITY_SPAN_LN = 0.69;

/** `sentiment_swing`: fires when |Fear & Greed now − 7d ago| `>=` this many points. */
export const SENTIMENT_SWING_POINTS = 25;
/** Points past the threshold that map to full severity. */
export const SENTIMENT_SWING_SEVERITY_SPAN = 25;

/** `price_stretched_ma99`: fires when |price distance from the daily MA99| (%) `>=` this. */
export const MA99_STRETCH_PCT = 30;
/** Percentage points past the threshold that map to full severity. */
export const MA99_STRETCH_SEVERITY_SPAN = 30;

/**
 * `volatility_expansion`: fires when daily ATR as a share of price (%) `>=` this.
 * Crypto dailies sit near 2-3% in calm regimes, so 5% marks a genuinely wide one.
 */
export const ATR_EXPANSION_PCT = 5;
/** Percentage points past the threshold that map to full severity. */
export const ATR_EXPANSION_SEVERITY_SPAN = 5;
