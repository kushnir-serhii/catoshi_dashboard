'use client';

import { Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { WATCHLIST_HORIZON_DAYS } from '@/consts/projections';
import type { MarketListItem, ProjectionData } from '@/data/types';
import { summariseProjection } from '@/lib/projectionSummary';
import { cn } from '@/utils/cn';

import { PanelStatusBar } from '../PanelStatusBar';
import { WATCHLIST_COLUMNS } from './columns';
import { WatchlistRow } from './WatchlistRow';

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
    <Card className="[grid-area:watch] max-sm:p-3">
      <CardHeader className="max-sm:mb-3">
        <CardTitle marker="green">Watchlist</CardTitle>
        <div className="flex items-center gap-3">
          {!isLoading && coins.length > 0 && (
            <span className="text-text-3 text-xs tabular-nums">Refreshes in {countdown}s</span>
          )}
          <Button onClick={onManage}>Manage list</Button>
        </div>
      </CardHeader>

      {coins.length === 0 ? (
        <div className="text-text-3 p-4">
          Your watchlist is empty. Add a coin to track its price and forecast.
        </div>
      ) : (
        <div
          className="focus-visible:outline-violet [scrollbar-width:thin] overflow-x-auto focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 max-sm:overflow-visible"
          role="region"
          aria-label="Watchlist, scrolls sideways"
          tabIndex={0}
        >
          <table className="w-full min-w-145 border-collapse max-sm:block max-sm:min-w-0">
            <thead className="max-sm:hidden">
              <tr>
                {WATCHLIST_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'border-line text-text-3 border-b px-3 pb-3 text-left text-xs font-medium tracking-(--ls-label) uppercase',
                      col.alignRight && 'text-right',
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
              {coins.map((coin) => {
                const market = byId.get(coin.id.toLowerCase()) ?? null;
                const projection = projectionBySymbol.get(coin.symbol.toUpperCase()) ?? null;
                return (
                  <WatchlistRow
                    key={coin.id}
                    coin={coin}
                    market={isLoading ? null : market}
                    summary={summariseProjection(projection, WATCHLIST_HORIZON_DAYS)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && isStale && coins.length > 0 && (
        <PanelStatusBar>
          <span className="text-warning">Data may be outdated</span>
        </PanelStatusBar>
      )}
    </Card>
  );
}
