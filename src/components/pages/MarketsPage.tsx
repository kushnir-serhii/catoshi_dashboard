'use client';

import { useState } from 'react';

import { HistoricalPriceChart } from '@/components/dashboard/HistoricalPriceChart';
import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { KPIs } from '@/components/panels/KPIs';
import { DEFAULT_ASSET_IDS } from '@/consts/prices';
import { marketAssets, marketKpis, sectors } from '@/data/markets';
import type { KpiItem, MarketAsset, MarketListItem, PriceMap } from '@/data/types';
import { useMarkets } from '@/hooks/useMarkets';
import { usePrices } from '@/hooks/usePrices';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

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
const SYM_TO_COIN_ID: Record<string, string> = Object.fromEntries(
  Object.entries(ASSET_ID_TO_SYM).map(([id, sym]) => [sym, id]),
);

function formatPrice(usd: number): string {
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

function formatDelta(change: number): string {
  const abs = Math.abs(change).toFixed(2);
  return change >= 0 ? `+${abs}%` : `−${abs}%`;
}

function formatCompactUSD(value: number): string {
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

function mapPricesToKpis(prices: PriceMap, liveAssets: MarketListItem[] | null): KpiItem[] {
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
type SortableKey = 'current_price' | 'price_change_percentage_24h' | 'market_cap' | 'total_volume';

interface SortState {
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

function sortLiveAssets(items: MarketListItem[], sort: SortState): MarketListItem[] {
  return [...items].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av !== 'number' || typeof bv !== 'number') return 0;
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
}

function sortMockAssets(items: MarketAsset[], sort: SortState): MarketAsset[] {
  return [...items].sort((a, b) => {
    const av = mockNumericValue(a, sort.key);
    const bv = mockNumericValue(b, sort.key);
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
}

// Skeleton cell used in the markets table during live-data loading
function SkeletonCell() {
  return <div className="h-4 w-16 animate-pulse rounded-sm bg-surface-3" />;
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', ...style }}>{children}</div>;
}

// ------------------------------------------------------------------
// Sub-component that owns live-data fetching for the KPI + table
// ------------------------------------------------------------------
function LiveMarketsContent() {
  const {
    prices,
    isLoading: pricesLoading,
    isStale: pricesStale,
    countdown,
  } = usePrices(Array.from(DEFAULT_ASSET_IDS));
  const { assets: liveAssets, isLoading: marketsLoading, isStale: marketsStale } = useMarkets();

  const kpiItems: KpiItem[] = prices ? mapPricesToKpis(prices, liveAssets) : [];

  // Combined loading: skeleton shown while either prices or markets are on first load
  const isLoading = pricesLoading || marketsLoading;

  return (
    <>
      <KPIs
        items={kpiItems}
        isLoading={pricesLoading}
        isStale={pricesStale}
        countdown={countdown}
      />

      <MarketsTableContent
        assets={marketAssets}
        liveAssets={liveAssets}
        prices={prices}
        isLoading={isLoading}
        isStale={marketsStale}
      />
    </>
  );
}

// ------------------------------------------------------------------
// Markets table (shared between mock and live modes)
// ------------------------------------------------------------------
interface MarketsTableContentProps {
  assets: MarketAsset[];
  liveAssets: MarketListItem[] | null;
  prices: PriceMap | null;
  isLoading: boolean;
  isStale: boolean;
}

// Build a lookup from symbol (uppercase) to MarketListItem for O(1) row resolution
function buildLiveAssetMap(liveAssets: MarketListItem[] | null): Map<string, MarketListItem> {
  const map = new Map<string, MarketListItem>();
  if (!liveAssets) return map;
  for (const item of liveAssets) {
    map.set(item.symbol.toUpperCase(), item);
  }
  return map;
}

function MarketsTableContent({
  assets,
  liveAssets,
  prices,
  isLoading,
  isStale,
}: MarketsTableContentProps) {
  const [sort, setSort] = useState<SortState>({ key: 'market_cap', dir: 'desc' });
  const [filter, setFilter] = useState('');

  const liveMap = buildLiveAssetMap(liveAssets);

  // Sort the source data. In live mode sort liveAssets and rebuild the map;
  // in mock mode sort the assets array directly.
  const sortedLiveAssets = liveAssets ? sortLiveAssets(liveAssets, sort) : null;
  const sortedLiveMap = buildLiveAssetMap(sortedLiveAssets);
  const sortedAssets = sortedLiveAssets
    ? assets // live mode: row order driven by sortedLiveAssets below
    : sortMockAssets(assets, sort);

  function handleSortClick(key: SortableKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  }

  function SortableHeader({
    label,
    sortKey,
    align = 'right',
  }: {
    label: string;
    sortKey: SortableKey;
    align?: 'left' | 'right';
  }) {
    const isActive = sort.key === sortKey;
    const indicator = isActive ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th
        aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{
          textAlign: align,
          color: isActive ? 'var(--text)' : undefined,
          borderBottom: isActive ? '1px solid var(--text)' : undefined,
        }}
      >
        <button
          type="button"
          onClick={() => handleSortClick(sortKey)}
          title={`Sort by ${label}`}
          style={{
            font: 'inherit',
            color: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            userSelect: 'none',
            width: '100%',
            textAlign: align,
          }}
        >
          {label}
          <span aria-hidden="true">{indicator}</span>
        </button>
      </th>
    );
  }

  // In live mode, iterate over sorted live assets and map each back to its mock asset by symbol.
  // In mock mode, iterate over sorted mock assets.
  const rows: Array<{ mockAsset: MarketAsset; live: MarketListItem | undefined }> = sortedLiveAssets
    ? sortedLiveAssets.map((liveItem) => ({
        mockAsset: assets.find((a) => a.sym === liveItem.symbol.toUpperCase()) ?? assets[0],
        live: liveItem,
      }))
    : sortedAssets.map((a) => ({
        mockAsset: a,
        live: liveMap.get(a.sym),
      }));

  // Client-side filter over the already-fetched rows — matches symbol or name.
  const query = filter.trim().toLowerCase();
  const visibleRows = query
    ? rows.filter(({ mockAsset: a, live }) => {
        const sym = (live?.symbol ?? a.sym).toLowerCase();
        const name = (live?.name ?? a.name).toLowerCase();
        return sym.includes(query) || name.includes(query);
      })
    : rows;

  // suppress unused-var hint — liveMap is retained for the mock path via the rows helper above
  void sortedLiveMap;

  return (
    <div className="card glow-violet">
      <div className="card-header">
        <div className="card-title">
          <span className="marker green"></span>All markets
        </div>
        <Row>
          <div className="search" style={{ maxWidth: 220 }}>
            <span aria-hidden="true" style={{ opacity: 0.5 }}>
              ⌕
            </span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter assets…"
              aria-label="Filter assets by symbol or name"
            />
          </div>
        </Row>
      </div>
      <div
        className="tbl-wrap"
        role="region"
        aria-label="Markets table, scrolls sideways"
        tabIndex={0}
      >
        <table className="watch-table">
          <thead>
            <tr>
              <th>Asset</th>
              <SortableHeader label="Price" sortKey="current_price" />
              <SortableHeader label="24h" sortKey="price_change_percentage_24h" />
              <SortableHeader label="Volume" sortKey="total_volume" />
              <SortableHeader label="Market cap" sortKey="market_cap" />
              <th>Trend</th>
              <th style={{ textAlign: 'right' }}>60d projection</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ padding: 'var(--sp-5) var(--sp-3)' }}>
                  No asset matches &ldquo;{filter.trim()}&rdquo;.
                </td>
              </tr>
            )}
            {visibleRows.map(({ mockAsset: a, live }, i) => {
              const coinId = SYM_TO_COIN_ID[a.sym];
              const priceEntry = prices && coinId ? prices[coinId] : null;
              const px = live
                ? formatPrice(live.current_price)
                : priceEntry
                  ? formatPrice(priceEntry.usd)
                  : a.px;
              const d24 = live
                ? formatDelta(live.price_change_percentage_24h)
                : priceEntry
                  ? formatDelta(priceEntry.usd_24h_change)
                  : a.d24;
              const up = live
                ? live.price_change_percentage_24h >= 0
                : priceEntry
                  ? priceEntry.usd_24h_change >= 0
                  : a.up;
              const vol = live ? formatCompactUSD(live.total_volume) : a.vol;
              const mc = live ? formatCompactUSD(live.market_cap) : a.mc;

              return (
                <tr key={i}>
                  <td>
                    <div className="sym">
                      {live ? (
                        <img
                          src={live.image}
                          alt={live.name}
                          width={24}
                          height={24}
                          style={{ borderRadius: '50%', flexShrink: 0 }}
                        />
                      ) : (
                        <div className={`coin-mark ${a.sym.toLowerCase()}`}>
                          {a.sym.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <div>{a.sym}</div>
                        <div className="name">{live ? live.name : a.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {isLoading ? <SkeletonCell /> : px}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {isLoading ? (
                      <SkeletonCell />
                    ) : (
                      <span className={up ? 'delta-up' : 'delta-dn'}>{d24}</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                    {isLoading ? <SkeletonCell /> : vol}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                    {isLoading ? <SkeletonCell /> : mc}
                  </td>
                  <td style={{ width: 100 }}>
                    {isLoading ? (
                      <SkeletonCell />
                    ) : live ? (
                      <SparklineChart
                        prices={live.sparkline_in_7d.price}
                        isPositive={
                          live.sparkline_in_7d.price.length > 1 &&
                          live.sparkline_in_7d.price[live.sparkline_in_7d.price.length - 1] >=
                            live.sparkline_in_7d.price[0]
                        }
                      />
                    ) : (
                      <SparklineChart
                        prices={a.sparkline}
                        isPositive={
                          a.sparkline.length > 1 &&
                          a.sparkline[a.sparkline.length - 1] >= a.sparkline[0]
                        }
                      />
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    <span className={a.proj.startsWith('+') ? 'delta-up' : 'delta-dn'}>
                      {a.proj}
                    </span>
                  </td>
                  <td>
                    <Row style={{ gap: 'var(--sp-2)' }}>
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          background: 'var(--surface-3)',
                          borderRadius: 'var(--radius-pill)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${a.conf}%`,
                            borderRadius: 'var(--radius-pill)',
                            background: 'linear-gradient(90deg, var(--violet), var(--green))',
                            boxShadow: '0 0 var(--glow-sm) var(--color-violet)',
                          }}
                        ></div>
                      </div>
                      <span className="mono small" style={{ width: 28, textAlign: 'right' }}>
                        {a.conf}
                      </span>
                    </Row>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isStale && (
        <div role="status" className="border-t border-(--line) px-4 py-2 text-xs">
          <span style={{ color: 'var(--warning)' }}>Data may be outdated</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Page root
// ------------------------------------------------------------------
export function MarketsPage() {
  return (
    <div className="page-content">
      <h1 className="sr-only">Markets</h1>
      <HistoricalPriceChart />

      {/* Sectors */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="marker"></span>Sectors · 24h
          </div>
        </div>
        <div className="pg-sectors" style={{ gap: 'var(--sp-3)' }}>
          {sectors.map((s, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--sp-4)',
                background: 'var(--bg-2)',
              }}
            >
              <div
                className="small muted"
                style={{
                  letterSpacing: 'var(--ls-label)',
                  textTransform: 'uppercase',
                  fontSize: 'var(--fs-xs)',
                }}
              >
                {s.name}
              </div>
              <div
                className={`tnum ${s.up ? 'delta-up' : 'delta-dn'}`}
                style={{ fontSize: 'var(--fs-lg)', marginTop: 'var(--sp-2)', letterSpacing: 'var(--ls-tight)' }}
              >
                {s.change}
              </div>
              <div className="small mono" style={{ color: 'var(--text-3)', marginTop: 'var(--sp-1)' }}>
                {s.count} assets
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs + Markets table */}
      {USE_MOCK ? (
        <>
          <KPIs items={marketKpis} isLoading={false} isStale={false} countdown={60} />
          <MarketsTableContent
            assets={marketAssets}
            liveAssets={null}
            prices={null}
            isLoading={false}
            isStale={false}
          />
        </>
      ) : (
        <LiveMarketsContent />
      )}
    </div>
  );
}
