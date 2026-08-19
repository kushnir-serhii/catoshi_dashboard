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
