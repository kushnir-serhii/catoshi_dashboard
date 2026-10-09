'use client';

import { useState } from 'react';

import { Card, CardHeader, CardTitle, Muted } from '@/components/ui';
import type { MarketAsset, MarketListItem, PriceMap } from '@/data/types';

import { MarketsRow } from './MarketsRow';
import { SortableHeader } from './SortableHeader';
import type { SortableKey, SortState } from './utils';
import { buildLiveAssetMap, sortLiveAssets, sortMockAssets } from './utils';

interface MarketsTableProps {
  assets: MarketAsset[];
  liveAssets: MarketListItem[] | null;
  prices: PriceMap | null;
  isLoading: boolean;
  isStale: boolean;
}

// Markets table (shared between mock and live modes)
export function MarketsTable({
  assets,
  liveAssets,
  prices,
  isLoading,
  isStale,
}: MarketsTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'market_cap', dir: 'desc' });
  const [filter, setFilter] = useState('');

  const liveMap = buildLiveAssetMap(liveAssets);

  // Sort the source data. In live mode sort liveAssets; in mock mode sort the assets array directly.
  const sortedLiveAssets = liveAssets ? sortLiveAssets(liveAssets, sort) : null;
  const sortedAssets = sortedLiveAssets
    ? assets // live mode: row order driven by sortedLiveAssets below
    : sortMockAssets(assets, sort);

  function handleSortClick(key: SortableKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
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

  return (
    <Card glow>
      <CardHeader>
        <CardTitle marker="green">All markets</CardTitle>
        <div className="flex items-center gap-3">
          <div className="border-line bg-bg-2 text-text-3 flex h-9 max-w-55 flex-1 items-center gap-3 rounded border px-4 text-sm pointer-coarse:h-auto pointer-coarse:min-h-11">
            <span aria-hidden="true" className="opacity-50">
              ⌕
            </span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter assets…"
              aria-label="Filter assets by symbol or name"
              className="text-text flex-1 border-0 bg-transparent text-base outline-0"
            />
          </div>
        </div>
      </CardHeader>
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
              <SortableHeader
                label="Price"
                sortKey="current_price"
                sort={sort}
                onSort={handleSortClick}
              />
              <SortableHeader
                label="24h"
                sortKey="price_change_percentage_24h"
                sort={sort}
                onSort={handleSortClick}
              />
              <SortableHeader
                label="Volume"
                sortKey="total_volume"
                sort={sort}
                onSort={handleSortClick}
              />
              <SortableHeader
                label="Market cap"
                sortKey="market_cap"
                sort={sort}
                onSort={handleSortClick}
              />
              <th>Trend</th>
              <th className="text-right">60d projection</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <Muted>No asset matches &ldquo;{filter.trim()}&rdquo;.</Muted>
                </td>
              </tr>
            )}
            {visibleRows.map(({ mockAsset, live }, i) => (
              <MarketsRow
                key={i}
                asset={mockAsset}
                live={live}
                prices={prices}
                isLoading={isLoading}
              />
            ))}
          </tbody>
        </table>
      </div>
      {isStale && (
        <div role="status" className="border-line border-t px-4 py-2 text-xs">
          <span className="text-warning">Data may be outdated</span>
        </div>
      )}
    </Card>
  );
}
