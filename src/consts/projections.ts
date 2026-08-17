export const PROJECTION_COINS = ['BTC', 'ETH', 'SOL'] as const;

export const COINGECKO_ID_BY_SYMBOL: Record<(typeof PROJECTION_COINS)[number], string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

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
export const PROJECTION_SCHEMA_VERSION = 2;

// Non-uniform forecast day grid: daily (1-30), weekly (37-177), monthly (210-365).
// Single source of truth — never re-derive this grid at a call site.
export const FORECAST_GRID_DAYS: readonly number[] = [
  ...Array.from({ length: 30 }, (_, i) => i + 1),
  ...Array.from({ length: 21 }, (_, i) => 37 + i * 7),
  210, 240, 270, 300, 330, 365,
];
