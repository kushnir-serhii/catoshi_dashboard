import type { CoinListItem } from '@/data/types';

/** Coin the Projections page opens on before the user picks their own. */
export const DEFAULT_COIN: CoinListItem = {
  id: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
};

/** The always-cached AI forecast batch — refreshed on the normal 6h cache
 * cycle regardless of which coin the user has selected. Forecasting any
 * coin outside this set is on-demand only (see the "Reforecast" action),
 * since each one is a real, billed AI call. */
export const DEFAULT_FORECAST_TARGETS: ForecastTarget[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
];

export interface ForecastTarget {
  id: string;
  symbol: string;
  name: string;
}

/** Model routing whitelist — the allowed model ids per AI provider. Single
 * source of truth shared by the provider layer, both projection Route
 * Handlers, and the forecast-settings UI. */
export const ALLOWED_FORECAST_MODELS: Record<string, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

/** Provider + model used when a caller specifies neither, or an invalid pair. */
export const DEFAULT_FORECAST_SERVICE = 'openai';
export const DEFAULT_FORECAST_MODEL = 'gpt-4o-mini';

/** How long a forecast batch is served from the platform cache before the
 * next request triggers a fresh generation (spec 019). */
export const FORECAST_TTL_SECONDS = 21600; // 6 hours

/** Ceiling on forecast generations (distinct `as_of` groups in
 * `public.forecasts`) per UTC day, enforced by the reforecast route
 * (spec 019, Slice 3). */
export const FORECAST_DAILY_CALL_LIMIT = 20;

/** Name of the HttpOnly cookie that carries the admin credential, set by
 * `GET /api/admin/unlock` and read by `POST /api/projections/refresh`
 * (spec 019, Slice 3). Shared here per the constants rule — it's used in
 * both routes. */
export const ADMIN_COOKIE_NAME = 'catoshi_admin';

/** Spec 020 — scheduled forecast ingestion.
 *
 * `ROUTINE_SOURCE` is the `public.forecasts.source` value for a batch produced
 * by the scheduled Claude task rather than a paid provider call; it is also the
 * `source <> 'routine'` predicate spec 019's paid daily ceiling filters on.
 * `ROUTINE_PROMPT_VERSION` is the `prompt_version` (text) those rows carry —
 * bumped whenever `docs/routine-forecast-prompt.md` changes. */
export const ROUTINE_SOURCE = 'routine';
export const ROUTINE_PROMPT_VERSION = 'routine-v1';

/** Separate, larger daily ceiling than `FORECAST_DAILY_CALL_LIMIT` — it protects
 * `public.forecasts` from a looping scheduler, not the operator's paid budget.
 * At `SCHEDULED_FORECAST_INTERVAL_HOURS` a healthy schedule makes 8 ingests/day. */
export const FORECAST_DAILY_INGEST_LIMIT = 48;

/** Max % gap between an ingested batch's per-coin `currentPrice` and the server's
 * own reference price for that coin before the batch is rejected (spec 020
 * functional-spec §2.4). Starts at 5; expected to tighten once a week of
 * accepted ingests shows the real spread. */
export const INGEST_ANCHOR_MAX_DEVIATION_PCT = 5;

/** Cadence of the scheduled forecast task, against the 6-hour freshness window:
 * one missed run still lands inside the window, so it costs nothing. */
export const SCHEDULED_FORECAST_INTERVAL_HOURS = 3;

/** `/api/health` flips the scheduled producer to `late` at this age — 2× the
 * interval, i.e. before the freshness window elapses and the paid path engages. */
export const SCHEDULED_FORECAST_LATE_AFTER_SECONDS = SCHEDULED_FORECAST_INTERVAL_HOURS * 2 * 3600;

/** `public.collector_status.source` key the ingest route records each attempt
 * under (accepted or rejected), and the component `/api/health` reads back as
 * the scheduled producer's state. Shared between the ingest flow and health. */
export const FORECAST_INGEST_COMPONENT = 'forecast_ingest';

export const RANGE_OPTIONS = ['1W', '1M', '3M', '6M', '1Y'] as const;

export const RANGE_DAYS: Record<(typeof RANGE_OPTIONS)[number], number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

export const HISTORY_FETCH_DAYS = 365;
export const MIN_PX_PER_POINT = 6;
export const Y_DOMAIN_PADDING = 0.03;
export const PROJECTION_SCHEMA_VERSION = 3;

/** Output-token ceiling for a forecast call, shared by both providers.
 * One batch is 3 coins x 3 scenarios x `FORECAST_GRID_DAYS.length` {d,p}
 * points; a measured gpt-4o-mini run spends ~7.4k output tokens on that,
 * so the previous 8192 cap sat inside normal variance. Truncation is a
 * silent failure — OpenAI returns half a JSON document, Claude a half-built
 * tool input — so the cap is set well clear of the observed cost. */
export const FORECAST_MAX_OUTPUT_TOKENS = 16384;

/** Number of popular coins shown in the "Model predictions" panel. */
export const AI_PANEL_ROW_COUNT = 5;

// Non-uniform forecast day grid: daily (1-30), weekly (37-177), monthly (210-365).
// Single source of truth — never re-derive this grid at a call site.
export const FORECAST_GRID_DAYS: readonly number[] = [
  ...Array.from({ length: 30 }, (_, i) => i + 1),
  ...Array.from({ length: 21 }, (_, i) => 37 + i * 7),
  210,
  240,
  270,
  300,
  330,
  365,
];
