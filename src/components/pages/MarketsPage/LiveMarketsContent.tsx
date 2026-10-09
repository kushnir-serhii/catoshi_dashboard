'use client';

import { KPIs } from '@/components/panels/KPIs';
import { DEFAULT_ASSET_IDS } from '@/consts/prices';
import { marketAssets } from '@/data/markets';
import type { KpiItem } from '@/data/types';
import { useMarkets } from '@/hooks/useMarkets';
import { usePrices } from '@/hooks/usePrices';

import { MarketsTable } from './MarketsTable';
import { mapPricesToKpis } from './utils';

// Owns live-data fetching for the KPI strip + markets table
export function LiveMarketsContent() {
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

      <MarketsTable
        assets={marketAssets}
        liveAssets={liveAssets}
        prices={prices}
        isLoading={isLoading}
        isStale={marketsStale}
      />
    </>
  );
}
