/**
 * Macroeconomic data sources (spec 027 slice 3): FRED time series IDs tracked by
 * the Macro Pulse. These are kept in lock-step with the collector (`src/lib/collectors/`)
 * and the signal generator (`src/lib/signals/generate.ts`).
 */
export const MACRO_SERIES = ['DGS10', 'DCOILBRENTEU', 'DTWEXBGS'] as const;

/** Type of a valid macro series ID. */
export type MacroSeriesId = (typeof MACRO_SERIES)[number];

/**
 * Interval (hours) at which the macro collector polls FRED for new observations.
 * GitHub Actions triggers this every 6 hours.
 */
export const MACRO_FETCH_INTERVAL_HOURS = 6;

/**
 * Maximum age (days) before a macro series observation is considered stale and not
 * shown on the Pulse. DGS10 (10Y Treasury) updates daily (4 days tolerance);
 * DCOILBRENTEU (Brent) and DTWEXBGS (USD Index) arrive weekly (10–12 days tolerance).
 */
export const MACRO_MAX_AGE_DAYS: Record<MacroSeriesId, number> = {
  DGS10: 4,
  DCOILBRENTEU: 10,
  DTWEXBGS: 12,
};

/**
 * Duration (hours) after a macro observation's timestamp for which it contributes
 * to signal decay. Used to fade the severity of macro-driven signals over time.
 */
export const MACRO_DECAY_HOURS = 72;

/**
 * Network timeout (ms) for FRED API requests. FRED's public API can be slow;
 * a hard 5s limit prevents hanging on stalled connections.
 */
export const MACRO_FETCH_TIMEOUT_MS = 5000;

/**
 * FRED REST API base URL. Uses the keyed endpoint for higher reliability.
 * Requires `FRED_API_KEY` in `.env` (free tier from fred.stlouisfed.org).
 */
export const FRED_API_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

/* ------------------------------------------------------------------------- *
 * Macro Pulse rule thresholds (spec 027 functional §2.4).
 *
 * These thresholds define the changes in macro data that trigger a signal.
 * Threshold kind is 'pct' (percent) for Brent and dollar, 'bp' (basis points)
 * for the 10Y yield. Rising macro values (positive deltas) are bearish for crypto.
 * ------------------------------------------------------------------------- */

export const MACRO_THRESHOLDS: Record<MacroSeriesId, { kind: 'pct' | 'bp'; value: number }> = {
  /** Brent crude: ≥ ±3% daily change. */
  DCOILBRENTEU: { kind: 'pct', value: 3 },
  /** 10Y Treasury yield: ≥ ±8 basis points daily change. */
  DGS10: { kind: 'bp', value: 8 },
  /** USD Index (DXY proxy): ≥ ±0.5% daily change. */
  DTWEXBGS: { kind: 'pct', value: 0.5 },
};

/**
 * Rule id -> FRED series, for the three macro rules (spec 027 slice 3). One map so
 * the rules, the writer and `/api/signals` (which derives per-rule liveness from
 * `MACRO_MAX_AGE_DAYS`) agree on which series backs which `signals.rule_id`.
 */
export const MACRO_RULE_SERIES = {
  macro_brent: 'DCOILBRENTEU',
  macro_10y: 'DGS10',
  macro_dollar: 'DTWEXBGS',
} as const satisfies Record<string, MacroSeriesId>;

/** Id of a macro rule. */
export type MacroRuleId = keyof typeof MACRO_RULE_SERIES;

/**
 * Change past the threshold that maps to full severity, in the series' own unit
 * (percent for Brent and the dollar, basis points for the 10Y). Matches
 * `MACRO_THRESHOLDS`: a move of twice the threshold is severity 1.
 */
export const MACRO_SEVERITY_SPAN: Record<MacroSeriesId, number> = {
  DCOILBRENTEU: 3,
  DGS10: 8,
  DTWEXBGS: 0.5,
};

/* ---------------------------------------------------------------------------
 * Macro Calendar (spec 027, Slice 3): Health warnings and staleness thresholds.
 * The calendar is a hand-maintained JSON file (`src/data/macro-calendar.json`)
 * that tracks upcoming economic events (CPI, FOMC, etc.). It is consumed by
 * `/api/pulse` (next event within 72h) and `/api/health` (staleness warning).
 * --------------------------------------------------------------------------- */

/**
 * Number of days since `macro-calendar.json` was last updated before a health
 * warning is issued. Used by `/api/health` to alert operators that the calendar
 * may be stale relative to current market events (spec 027, Slice 3 §5).
 */
export const MACRO_CALENDAR_HEALTH_WARN_DAYS = 21;

/**
 * Number of days since `macro-calendar.json` was last updated before the
 * calendar is considered fully stale and the next-event line is omitted from
 * `/api/pulse`. After this threshold, assume the calendar is out of date
 * relative to published economic schedules (spec 027 technical §6.1).
 */
export const MACRO_CALENDAR_STALE_DAYS = 30;

/**
 * Lookahead window (hours) for `/api/pulse` to find the next upcoming event.
 * Returns the first event in the next 72 hours, or null if the calendar is stale
 * or there are no events in the window (spec 027 technical §6.1).
 */
export const MACRO_CALENDAR_LOOKAHEAD_HOURS = 72;
