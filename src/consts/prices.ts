export const DEFAULT_ASSET_IDS = [
  'bitcoin',
  'ethereum',
  'solana',
  'bittensor',
  'chainlink',
  'arbitrum',
  'render-token',
  'lido-dao',
] as const;
export const PRICES_REFRESH_INTERVAL_MS = 60_000;
export const HISTORY_DAYS_OPTIONS = [7, 30, 90, 365] as const;
export const HISTORY_CACHE_TTL_S = 3600;
export const MARKETS_PAGE_SIZE = 10;

/**
 * CoinGecko auth header. The demo tier is served from api.coingecko.com and
 * requires this header; sending `x-cg-pro-api-key` to that host is rejected
 * with error_code 10010. Pro keys use `x-cg-pro-api-key` + pro-api.coingecko.com.
 */
export const COINGECKO_API_KEY_HEADER = 'x-cg-demo-api-key';
