'use client';

import { Surface } from '@heroui/react';

import { AI_PANEL_ROW_COUNT, WATCHLIST_HORIZON_DAYS } from '@/consts/projections';
import type { CoinListItem, MarketListItem, ProjectionData } from '@/data/types';
import { formatPrice } from '@/lib/projectionSeries';
import { projectedPriceAt } from '@/lib/projectionSummary';

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

/** The base-curve horizon this panel projects to — the same value the
 * watchlist strip summarises to (`WATCHLIST_HORIZON_DAYS`). */
const FORECAST_HORIZON_DAYS = WATCHLIST_HORIZON_DAYS;

export function AIPanel({ popularAssets, projections, selectedCoin, onSelectCoin }: AIPanelProps) {
  const rows = (popularAssets ?? []).slice(0, AI_PANEL_ROW_COUNT);

  return (
    <Surface className="card area-ai" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <div className="card-title">
          <span className="marker green"></span>Model predictions
        </div>
        <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
          Most popular
        </span>
      </div>
      <p className="ai-headline">
        Top coins by market cap. Coins with a generated AI forecast show their target and confidence
        — pick any other coin above to forecast it too.
      </p>
      {rows.length === 0 && (
        <div className="muted small" style={{ padding: 'var(--sp-3) 0' }}>
          Loading popular coins…
        </div>
      )}
      {rows.map((asset) => {
        const symbol = asset.symbol.toUpperCase();
        const projection = projections?.find((p) => p.coin === symbol) ?? null;
        const isActive = selectedCoin.id === asset.id;

        const target = projectedPriceAt(projection, FORECAST_HORIZON_DAYS) ?? undefined;
        const deltaPct =
          target !== undefined
            ? ((target - asset.current_price) / asset.current_price) * 100
            : undefined;

        return (
          <button
            key={asset.id}
            className="ai-pred"
            onClick={() => onSelectCoin({ id: asset.id, symbol, name: asset.name })}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              // Selected state is a box-shadow, not an outline: `outline` is
              // now reserved for the keyboard focus ring, and the two on the
              // same element are indistinguishable.
              boxShadow: isActive ? '0 0 0 1px oklch(0.78 0.22 295 / 0.6)' : 'none',
            }}
            aria-pressed={isActive}
          >
            <div className="pair">
              <div className="row">
                <div className={`coin-mark ${symbol.toLowerCase()}`}>{symbol.slice(0, 1)}</div>
                <div>
                  <div className="sym">{symbol}</div>
                  <div className="muted small">
                    {asset.name} ·{' '}
                    {projection ? `${FORECAST_HORIZON_DAYS}D forecast` : 'Not forecasted'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="target tnum glow-text-violet">
                  {target !== undefined ? formatPrice(target) : formatPrice(asset.current_price)}
                </div>
                <div
                  className={`mono small ${(deltaPct ?? asset.price_change_percentage_24h) >= 0 ? 'delta-up' : 'delta-dn'}`}
                >
                  {(deltaPct ?? asset.price_change_percentage_24h) >= 0 ? '+' : ''}
                  {(deltaPct ?? asset.price_change_percentage_24h).toFixed(1)}%
                </div>
              </div>
            </div>
            {projection ? (
              <>
                <div className="gauge" aria-hidden="true">
                  <div className="fill" style={{ width: `${projection.confidence}%` }}></div>
                </div>
                <div className="meta">
                  <span>From {formatPrice(asset.current_price)}</span>
                  <span>Confidence {projection.confidence}%</span>
                </div>
              </>
            ) : (
              <div className="meta">
                <span>Live price · 24h change</span>
                <span>Click to forecast</span>
              </div>
            )}
          </button>
        );
      })}
    </Surface>
  );
}
