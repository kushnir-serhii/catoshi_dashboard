'use client';

import { Surface } from '@heroui/react';

import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { WATCHLIST_HORIZON_DAYS } from '@/consts/projections';
import type { MarketListItem, ProjectionData } from '@/data/types';
import { summariseProjection } from '@/lib/projectionSummary';

/** Minimal coin identity a watchlist row needs before the first market
 * response arrives (spec 021 §2.3). */
export interface WatchlistCoin {
  id: string;
  symbol: string;
  name: string;
}

interface WatchlistPanelProps {
  coins: WatchlistCoin[];
  assets: MarketListItem[] | null;
  /** Real AI forecasts (from `useProjections`). A coin without one renders a
   * dash under Projection — never a fabricated figure. */
  projections: ProjectionData[] | null;
  isLoading: boolean;
  isStale: boolean;
  countdown: number;
  onManage?: () => void;
}

const NOT_FORECAST_TITLE =
  'This coin has no AI forecast yet — pick it on the chart to forecast it.';

/** Pulse block using the same `animate-pulse rounded bg-gray-{600,700}`
 * classes `KPIs` renders for its first-load skeleton. */
function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded ${className}`} />;
}

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

/** Match the Markets table: trend direction is last close vs first close. */
function sparklineIsPositive(prices: number[]): boolean {
  return prices.length > 1 && prices[prices.length - 1] >= prices[0];
}

export function WatchlistPanel({
  coins,
  assets,
  projections,
  isLoading,
  isStale,
  countdown,
  onManage,
}: WatchlistPanelProps) {
  const byId = new Map((assets ?? []).map((a) => [a.id.toLowerCase(), a]));
  // ProjectionData.coin is an uppercase symbol; MarketListItem.symbol is lowercase.
  const projectionBySymbol = new Map((projections ?? []).map((p) => [p.coin.toUpperCase(), p]));

  return (
    <Surface className="card area-watch">
      <div className="card-header">
        <div className="card-title">
          <span className="marker green"></span>Watchlist
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isLoading && coins.length > 0 && (
            <span className="text-xs text-(--text-3) tabular-nums">Refreshes in {countdown}s</span>
          )}
          <button className="btn-ghost" onClick={onManage}>
            Manage list
          </button>
        </div>
      </div>

      {coins.length === 0 ? (
        <div className="muted" style={{ padding: '1rem' }}>
          Your watchlist is empty. Add a coin to track its price and forecast.
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="watch-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>24h</th>
                <th>Trend</th>
                <th style={{ textAlign: 'right' }}>Projection</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin) => {
                const market = byId.get(coin.id.toLowerCase());
                const pending = isLoading || !market;
                const projection = projectionBySymbol.get(coin.symbol.toUpperCase()) ?? null;
                const summary = summariseProjection(projection, WATCHLIST_HORIZON_DAYS);

                return (
                  <tr key={coin.id}>
                    <td>
                      <div className="sym">
                        <div className={`coin-mark ${coin.symbol.toLowerCase()}`}>
                          {coin.symbol.slice(0, 1)}
                        </div>
                        <div>
                          <div>{coin.symbol}</div>
                          <div className="name">{coin.name}</div>
                        </div>
                      </div>
                    </td>

                    {pending ? (
                      <>
                        <td style={{ textAlign: 'right' }}>
                          <Pulse className="ml-auto h-6 w-24 bg-gray-700" />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Pulse className="ml-auto h-4 w-16 bg-gray-600" />
                        </td>
                        <td>
                          <Pulse className="h-6 w-22.5 bg-gray-700" />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Pulse className="ml-auto h-4 w-12 bg-gray-600" />
                        </td>
                        <td>
                          <Pulse className="h-4 w-20 bg-gray-700" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="tnum" style={{ textAlign: 'right' }}>
                          {formatPrice(market.current_price)}
                        </td>
                        <td className="delta mono" style={{ textAlign: 'right' }}>
                          <span
                            className={
                              market.price_change_percentage_24h >= 0 ? 'delta-up' : 'delta-dn'
                            }
                          >
                            {formatDelta(market.price_change_percentage_24h)}
                          </span>
                        </td>
                        <td>
                          <div style={{ width: 90, height: 24 }}>
                            <SparklineChart
                              prices={market.sparkline_in_7d.price}
                              isPositive={sparklineIsPositive(market.sparkline_in_7d.price)}
                            />
                          </div>
                        </td>
                        {summary === null ? (
                          <>
                            <td className="mono muted" style={{ textAlign: 'right' }}>
                              <span title={NOT_FORECAST_TITLE}>—</span>
                            </td>
                            <td>
                              <div className="proj-bar">
                                <div className="center"></div>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="mono" style={{ textAlign: 'right' }}>
                              <span className={summary.deltaPct >= 0 ? 'delta-up' : 'delta-dn'}>
                                {summary.deltaPct >= 0 ? '+' : ''}
                                {summary.deltaPct.toFixed(1)}%
                              </span>
                            </td>
                            <td>
                              <div className="proj-bar">
                                <div className="center"></div>
                                <div
                                  className={`fill ${summary.deltaPct >= 0 ? 'green' : ''}`}
                                  style={{ width: `${summary.confidence}%` }}
                                ></div>
                              </div>
                            </td>
                          </>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && isStale && coins.length > 0 && (
        <div className="flex items-center gap-2 border-t border-(--line) px-4 py-2 text-xs text-(--text-3) tabular-nums">
          <span style={{ color: 'var(--warning)' }}>Data may be outdated</span>
        </div>
      )}
    </Surface>
  );
}
