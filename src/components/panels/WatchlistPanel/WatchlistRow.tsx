import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { CoinMark } from '@/components/panels/CoinMark';
import type { MarketListItem } from '@/data/types';
import type { summariseProjection } from '@/lib/projectionSummary';

import { ProjectionBar } from './ProjectionBar';
import { formatDelta, formatPrice, sparklineIsPositive } from './utils';
import { WatchlistCell } from './WatchlistCell';
import { WatchlistRowSkeleton } from './WatchlistRowSkeleton';

const NOT_FORECAST_TITLE =
  'This coin has no AI forecast yet — pick it on the chart to forecast it.';

interface WatchlistRowProps {
  coin: { id: string; symbol: string; name: string };
  /** `null` while the market response has not arrived. */
  market: MarketListItem | null;
  summary: ReturnType<typeof summariseProjection>;
}

export function WatchlistRow({ coin, market, summary }: WatchlistRowProps) {
  return (
    <tr className="max-sm:border-line max-sm:bg-surface-2 max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 max-sm:rounded max-sm:border max-sm:p-3 [&:last-child>td]:border-b-0">
      <WatchlistCell column="asset">
        <div className="flex items-center gap-3">
          <CoinMark symbol={coin.symbol} />
          <div>
            <div>{coin.symbol}</div>
            <div className="text-text-3 text-xs">{coin.name}</div>
          </div>
        </div>
      </WatchlistCell>

      {market === null ? (
        <WatchlistRowSkeleton />
      ) : (
        <>
          <WatchlistCell column="price">{formatPrice(market.current_price)}</WatchlistCell>
          <WatchlistCell column="change" className="font-mono">
            <span className={market.price_change_percentage_24h >= 0 ? 'text-green' : 'text-red'}>
              {formatDelta(market.price_change_percentage_24h)}
            </span>
          </WatchlistCell>
          <WatchlistCell column="trend">
            <div className="h-6 w-22.5">
              <SparklineChart
                prices={market.sparkline_in_7d.price}
                isPositive={sparklineIsPositive(market.sparkline_in_7d.price)}
              />
            </div>
          </WatchlistCell>
          {summary === null ? (
            <>
              <WatchlistCell column="projection" className="text-text-3 font-mono">
                <span title={NOT_FORECAST_TITLE}>—</span>
              </WatchlistCell>
              <WatchlistCell column="confidence">
                <ProjectionBar className="max-sm:ml-auto" />
              </WatchlistCell>
            </>
          ) : (
            <>
              <WatchlistCell column="projection" className="font-mono">
                <span className={summary.deltaPct >= 0 ? 'text-green' : 'text-red'}>
                  {summary.deltaPct >= 0 ? '+' : ''}
                  {summary.deltaPct.toFixed(1)}%
                </span>
              </WatchlistCell>
              <WatchlistCell column="confidence">
                <ProjectionBar
                  className="max-sm:ml-auto"
                  confidence={summary.confidence}
                  positive={summary.deltaPct >= 0}
                />
              </WatchlistCell>
            </>
          )}
        </>
      )}
    </tr>
  );
}
