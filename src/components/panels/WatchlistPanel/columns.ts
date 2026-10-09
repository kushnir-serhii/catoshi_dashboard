export type WatchlistColumnKey =
  | 'asset'
  | 'price'
  | 'change'
  | 'trend'
  | 'projection'
  | 'confidence';

export interface WatchlistColumn {
  key: WatchlistColumnKey;
  label: string;
  alignRight: boolean;
}

export const WATCHLIST_COLUMNS: WatchlistColumn[] = [
  { key: 'asset', label: 'Asset', alignRight: false },
  { key: 'price', label: 'Price', alignRight: true },
  { key: 'change', label: '24h', alignRight: true },
  { key: 'trend', label: 'Trend', alignRight: false },
  { key: 'projection', label: 'Projection', alignRight: true },
  { key: 'confidence', label: 'Confidence', alignRight: false },
];
