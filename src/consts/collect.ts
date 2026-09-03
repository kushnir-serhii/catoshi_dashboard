/**
 * One tracked asset's identity across the two external data sources the
 * collector reads from: Binance (klines) and CoinGecko (market data).
 * `binancePair` and `coingeckoId` match `db/migrations/0001_analytics.sql`'s
 * `assets` seed rows byte-for-byte so collector output lines up with the DB.
 */
export interface CollectAsset {
  symbol: string;
  binancePair: string;
  coingeckoId: string;
}

export const COLLECT_ASSETS: readonly CollectAsset[] = [
  { symbol: 'BTC', binancePair: 'BTCUSDT', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', binancePair: 'ETHUSDT', coingeckoId: 'ethereum' },
  { symbol: 'SOL', binancePair: 'SOLUSDT', coingeckoId: 'solana' },
] as const;

export const COLLECT_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export type CollectTimeframe = (typeof COLLECT_TIMEFRAMES)[number];

/** Number of klines fetched per (asset, timeframe) collection request. */
export const KLINE_LIMIT = 200;

/**
 * Earliest daily candle available on each asset's Binance USDT-M **futures**
 * perpetual contract (`GET fapi/v1/klines`, interval `1d`) — the furthest back
 * the history backfill (spec 013) can reach. Keyed by `CollectAsset.symbol`.
 *
 * Confirmed empirically 2026-09-03 against `fapi.binance.com` with a far-past
 * `startTime` and `limit=1`; the first candle openTime returned was:
 *   BTC  1567900800000  → 2019-09-08T00:00:00Z
 *   ETH  1574812800000  → 2019-11-27T00:00:00Z
 *   SOL  1600041600000  → 2020-09-14T00:00:00Z
 *
 * Spot history reaches further back but is deliberately not used — the live
 * collector reads futures, and mixing series corrupts spec 012's distance
 * metric (technical-considerations.md §3.1).
 */
export const BACKFILL_START: Readonly<Record<string, string>> = {
  BTC: '2019-09-08',
  ETH: '2019-11-27',
  SOL: '2020-09-14',
} as const;

/**
 * Binance `klines` `limit` used only by the history-backfill pagination
 * (spec 013, `fetchKlinesRange`) — the maximum the `fapi/v1/klines` endpoint
 * accepts in one request. The live collector keeps using `KLINE_LIMIT`.
 */
export const BACKFILL_KLINE_LIMIT = 1500;

/**
 * Minimum delay between consecutive Binance `klines` requests during a
 * backfill run (spec 013). Large-`limit` requests cost weight 10 against a
 * 2,400/min budget (~240 req/min); 300ms (~200 req/min) leaves a safety
 * margin. Requests are sequential per asset and never parallelised across
 * assets (technical-considerations.md §2.4).
 */
export const BACKFILL_REQUEST_SPACING_MS = 300;

/**
 * Fallback pause after an HTTP 429/418 from Binance when the response carries
 * no usable `Retry-After` header (spec 013). The run resumes from the same
 * cursor afterwards.
 */
export const BACKFILL_RATE_LIMIT_BACKOFF_MS = 60_000;

/**
 * Maximum consecutive 429/418 retries for a single backfill page request
 * before it resolves to `null` (spec 013).
 */
export const BACKFILL_MAX_RATE_LIMIT_RETRIES = 5;

/**
 * Rows per batch when chunk-upserting back-filled snapshots (spec 013).
 * 500 keeps each parameterised `INSERT ... ON CONFLICT` well under Postgres'
 * bind-parameter ceiling while still amortising round-trips over a ~2,400-row
 * per-asset history.
 */
export const BACKFILL_CHUNK = 500;

/** Moving-average periods computed on the 1d timeframe. */
export const MA_PERIODS = [7, 25, 99] as const;

export const RSI_PERIOD = 14;
export const ATR_PERIOD = 14;

/** Trailing window used to z-score the latest volume reading. */
export const VOLUME_Z_LOOKBACK = 20;

/**
 * Age, in minutes, past which the newest market snapshot is treated as stale
 * (spec 017, Slice 2). One threshold, shared by the dashboard's data-freshness
 * note (`src/lib/freshness.ts`) and the `/api/health` endpoint — two separate
 * numbers would drift apart.
 *
 * 90 minutes tolerates exactly one missed hourly collection run before the
 * product says so, and is deliberately aligned with
 * `FORECAST_SNAPSHOT_MAX_AGE_MINUTES` in `src/consts/scoring.ts` (the age limit
 * on binding a forecast to a snapshot) so "too old to forecast against" and
 * "too old to present as current" mean the same thing.
 */
export const SNAPSHOT_STALE_MINUTES = 90;
