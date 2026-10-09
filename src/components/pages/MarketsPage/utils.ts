import { DEFAULT_ASSET_IDS } from '@/consts/prices';
import type { KpiItem, MarketAsset, MarketListItem, PriceMap } from '@/data/types';

// Asset-id to display symbol mapping (same order as DEFAULT_ASSET_IDS)
const ASSET_ID_TO_SYM: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  bittensor: 'TAO',
  chainlink: 'LINK',
  arbitrum: 'ARB',
  'render-token': 'RNDR',
  'lido-dao': 'LDO',
};

// Inverse map: display symbol → CoinGecko ID
export const SYM_TO_COIN_ID: Record<string, string> = Object.fromEntries(
  Object.entries(ASSET_ID_TO_SYM).map(([id, sym]) => [sym, id]),
);

export function formatPrice(usd: number): string {
  if (usd >= 1000) {
    return usd.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDelta(change: number): string {
  const abs = Math.abs(change).toFixed(2);
  return change >= 0 ? `+${abs}%` : `−${abs}%`;
}

export function formatCompactUSD(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function mapPricesToKpis(prices: PriceMap, liveAssets: MarketListItem[] | null): KpiItem[] {
  // Join the real 7-day series onto each card by symbol — no extra request,
  // `liveAssets` is already fetched on this page.
  const sparklineBySym = new Map<string, number[]>();
  for (const item of liveAssets ?? []) {
    sparklineBySym.set(item.symbol.toUpperCase(), item.sparkline_in_7d.price);
  }

  return Array.from(DEFAULT_ASSET_IDS).map((id) => {
    const entry = prices[id];
    const sym = ASSET_ID_TO_SYM[id] ?? id.toUpperCase();
    const sparkline = sparklineBySym.get(sym);
    if (!entry) {
      return { lbl: sym, val: '—', deltaText: '—', deltaClass: 'muted', sparkline };
    }
    return {
      lbl: sym,
      val: formatPrice(entry.usd),
      deltaText: formatDelta(entry.usd_24h_change),
      deltaClass: entry.usd_24h_change >= 0 ? 'delta-up mono' : 'delta-dn mono',
      sparkline,
    };
  });
}

// ------------------------------------------------------------------
// Sort types and helpers
// ------------------------------------------------------------------
export type SortableKey =
  | 'current_price'
  | 'price_change_percentage_24h'
  | 'market_cap'
  | 'total_volume';

export interface SortState {
  key: SortableKey;
  dir: 'asc' | 'desc';
}

// Parse a compact-USD string (e.g. "$28.4B", "$1.37T", "$220M") into a number for mock sorting
function parseCompactUSD(s: string): number {
  const clean = s.replace(/[$,]/g, '').trim();
  const multipliers: Record<string, number> = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 };
  const last = clean[clean.length - 1];
  if (last && last in multipliers) {
    return parseFloat(clean.slice(0, -1)) * multipliers[last];
  }
  return parseFloat(clean) || 0;
}

// Parse a price string (e.g. "$69,750.40", "$1.04") into a number
function parsePrice(s: string): number {
  return parseFloat(s.replace(/[$,]/g, '')) || 0;
}

// Parse a delta string (e.g. "+1.84%", "−0.78%") into a number
function parseDelta(s: string): number {
  return parseFloat(s.replace(/[%+,]/g, '').replace('−', '-')) || 0;
}

// Extract numeric value from a mock MarketAsset for the given sort key
function mockNumericValue(a: MarketAsset, key: SortableKey): number {
  switch (key) {
    case 'current_price':
      return parsePrice(a.px);
    case 'price_change_percentage_24h':
      return parseDelta(a.d24);
    case 'market_cap':
      return parseCompactUSD(a.mc);
    case 'total_volume':
      return parseCompactUSD(a.vol);
  }
}

export function sortLiveAssets(items: MarketListItem[], sort: SortState): MarketListItem[] {
  return [...items].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av !== 'number' || typeof bv !== 'number') return 0;
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
}

export function sortMockAssets(items: MarketAsset[], sort: SortState): MarketAsset[] {
  return [...items].sort((a, b) => {
    const av = mockNumericValue(a, sort.key);
    const bv = mockNumericValue(b, sort.key);
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
}

// Build a lookup from symbol (uppercase) to MarketListItem for O(1) row resolution
export function buildLiveAssetMap(
  liveAssets: MarketListItem[] | null,
): Map<string, MarketListItem> {
  const map = new Map<string, MarketListItem>();
  if (!liveAssets) return map;
  for (const item of liveAssets) {
    map.set(item.symbol.toUpperCase(), item);
  }
  return map;
}
