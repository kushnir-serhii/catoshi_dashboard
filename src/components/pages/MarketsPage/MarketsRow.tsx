import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { Skeleton } from '@/components/ui';
import type { MarketAsset, MarketListItem, PriceMap } from '@/data/types';

import { ConfidenceBar } from './ConfidenceBar';
import { formatCompactUSD, formatDelta, formatPrice, SYM_TO_COIN_ID } from './utils';

interface MarketsRowProps {
  asset: MarketAsset;
  live: MarketListItem | undefined;
  prices: PriceMap | null;
  isLoading: boolean;
}

function isRising(series: number[]): boolean {
  return series.length > 1 && series[series.length - 1] >= series[0];
}

export function MarketsRow({ asset: a, live, prices, isLoading }: MarketsRowProps) {
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
    <tr>
      <td>
        <div className="flex items-center gap-3">
          {live ? (
            <img
              src={live.image}
              alt={live.name}
              width={24}
              height={24}
              className="shrink-0 rounded-pill"
            />
          ) : (
            <div className={`coin-mark ${a.sym.toLowerCase()}`}>{a.sym.slice(0, 1)}</div>
          )}
          <div>
            <div>{a.sym}</div>
            <div className="text-text-3 text-xs">{live ? live.name : a.name}</div>
          </div>
        </div>
      </td>
      <td className="text-right tabular-nums">
        {isLoading ? <Skeleton className="h-4 w-16" /> : px}
      </td>
      <td className="text-right font-mono">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <span className={up ? 'text-green' : 'text-red'}>{d24}</span>
        )}
      </td>
      <td className="text-text-2 text-right font-mono">
        {isLoading ? <Skeleton className="h-4 w-16" /> : vol}
      </td>
      <td className="text-text-2 text-right font-mono">
        {isLoading ? <Skeleton className="h-4 w-16" /> : mc}
      </td>
      <td className="w-25">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : live ? (
          <SparklineChart
            prices={live.sparkline_in_7d.price}
            isPositive={isRising(live.sparkline_in_7d.price)}
          />
        ) : (
          <SparklineChart prices={a.sparkline} isPositive={isRising(a.sparkline)} />
        )}
      </td>
      <td className="text-right font-mono">
        <span className={a.proj.startsWith('+') ? 'text-green' : 'text-red'}>{a.proj}</span>
      </td>
      <td>
        <ConfidenceBar conf={a.conf} />
      </td>
    </tr>
  );
}
