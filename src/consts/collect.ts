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
