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
