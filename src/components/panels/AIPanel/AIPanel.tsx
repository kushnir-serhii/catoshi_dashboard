'use client';

import { Card, CardHeader, CardTitle, Muted } from '@/components/ui';
import { AI_PANEL_ROW_COUNT } from '@/consts/projections';
import type { CoinListItem, MarketListItem, ProjectionData } from '@/data/types';

import { PredictionCard } from './PredictionCard';

interface AIPanelProps {
  glow?: number;
  /** Live top-market-cap coins (from `useMarkets`) — the "most popular
   * tokens" list shown here as forecast candidates. */
  popularAssets: MarketListItem[] | null;
  /** Whichever of `popularAssets` already have a real AI forecast are shown
   * with target/confidence; the rest show live price only. */
  projections: ProjectionData[] | null;
  selectedCoin: CoinListItem;
  onSelectCoin: (coin: CoinListItem) => void;
}

export function AIPanel({ popularAssets, projections, selectedCoin, onSelectCoin }: AIPanelProps) {
  const rows = (popularAssets ?? []).slice(0, AI_PANEL_ROW_COUNT);

  return (
    <Card className="flex flex-col [grid-area:ai] max-sm:p-3">
      <CardHeader className="max-sm:mb-3">
        <CardTitle marker="green">Model predictions</CardTitle>
        <span className="text-text-3 font-mono text-xs">Most popular</span>
      </CardHeader>
      <p className="text-text-2 mb-4 text-sm leading-(--lh-normal)">
        Top coins by market cap. Coins with a generated AI forecast show their target and confidence
        — pick any other coin above to forecast it too.
      </p>
      {rows.length === 0 && (
        <Muted as="div" className="py-3">
          Loading popular coins…
        </Muted>
      )}
      {rows.map((asset) => {
        const symbol = asset.symbol.toUpperCase();
        return (
          <PredictionCard
            key={asset.id}
            asset={asset}
            projection={projections?.find((p) => p.coin === symbol) ?? null}
            isActive={selectedCoin.id === asset.id}
            onSelectCoin={onSelectCoin}
          />
        );
      })}
    </Card>
  );
}
