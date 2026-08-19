/** Scenario simulator (Projections page) — slider bounds, defaults and the
 * statistical constants used to derive them from price history. Coin
 * selection is owned by the Projections page itself (see `DEFAULT_COIN` in
 * `src/consts/projections.ts`) and passed down as a prop. */

/** Days of daily history pulled to measure realized volatility and drift. */
export const SCENARIO_HISTORY_DAYS = 365;

/** Calendar days per year — crypto trades every day, so this is the annualization
 * factor for daily log returns (equities would use ~252 trading days). */
export const DAYS_PER_YEAR = 365;

/** Minimum daily observations before realized stats are trustworthy enough to
 * seed the sliders; below this the fallback defaults are used instead. */
export const SCENARIO_MIN_HISTORY_POINTS = 30;

/** Normal-distribution z-score for the 5th/95th percentile of a two-sided
 * interval. Using ±1σ instead would give the 16th/84th percentile. */
export const SCENARIO_PERCENTILE_Z = 1.645;

export const SCENARIO_HORIZON_MIN = 7;
export const SCENARIO_HORIZON_MAX = 365;
export const SCENARIO_HORIZON_DEFAULT = 60;

export const SCENARIO_VOL_MIN = 5;
export const SCENARIO_VOL_MAX = 200;
/** Used only when history is too short to measure realized volatility. */
export const SCENARIO_VOL_FALLBACK = 45;

export const SCENARIO_DRIFT_MIN = -50;
export const SCENARIO_DRIFT_MAX = 150;
export const SCENARIO_DRIFT_STEP = 0.5;
/** Used only when history is too short to measure realized drift. */
export const SCENARIO_DRIFT_FALLBACK = 0;
