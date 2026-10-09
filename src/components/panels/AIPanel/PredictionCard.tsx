import { CoinMark } from '@/components/panels/CoinMark';
import { Muted } from '@/components/ui';
import { GLOW_TEXT_VIOLET } from '@/consts/panelStyles';
import { WATCHLIST_HORIZON_DAYS } from '@/consts/projections';
import type { CoinListItem, MarketListItem, ProjectionData } from '@/data/types';
import { formatPrice } from '@/lib/projectionSeries';
import { projectedPriceAt } from '@/lib/projectionSummary';
import { cn } from '@/utils/cn';

import { ConfidenceGauge } from './ConfidenceGauge';
import { PredictionMeta } from './PredictionMeta';

/** The base-curve horizon this panel projects to — the same value the
 * watchlist strip summarises to (`WATCHLIST_HORIZON_DAYS`). */
const FORECAST_HORIZON_DAYS = WATCHLIST_HORIZON_DAYS;

interface PredictionCardProps {
  asset: MarketListItem;
  projection: ProjectionData | null;
  isActive: boolean;
  onSelectCoin: (coin: CoinListItem) => void;
}

export function PredictionCard({ asset, projection, isActive, onSelectCoin }: PredictionCardProps) {
  const symbol = asset.symbol.toUpperCase();

  const target = projectedPriceAt(projection, FORECAST_HORIZON_DAYS) ?? undefined;
  const deltaPct =
    target !== undefined ? ((target - asset.current_price) / asset.current_price) * 100 : undefined;
  const shownDelta = deltaPct ?? asset.price_change_percentage_24h;

  return (
    <button
      type="button"
      onClick={() => onSelectCoin({ id: asset.id, symbol, name: asset.name })}
      aria-pressed={isActive}
      className={cn(
        'border-line bg-bg-2 mb-3 block w-full cursor-pointer rounded-lg border p-4 text-left text-inherit [font:inherit]',
        'transition-[border-color,transform] duration-(--dur-fast) ease-in-out',
        'hover:border-violet-2/45 hover:-translate-y-px active:translate-y-0',
        'motion-reduce:transition-none motion-reduce:hover:transform-none max-sm:p-3',
        // Selected state is a box-shadow ring, not an outline: `outline` is
        // reserved for the keyboard focus ring, and the two on the same
        // element are indistinguishable.
        isActive && 'ring-violet-light/60 ring-1',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CoinMark symbol={symbol} />
          <div>
            <div className="font-semibold">{symbol}</div>
            <Muted as="div">
              {asset.name} · {projection ? `${FORECAST_HORIZON_DAYS}D forecast` : 'Not forecasted'}
            </Muted>
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-lg tabular-nums max-sm:text-base', GLOW_TEXT_VIOLET)}>
            {formatPrice(target ?? asset.current_price)}
          </div>
          <div
            className={cn(
              'font-mono text-sm leading-(--lh-normal)',
              shownDelta >= 0 ? 'text-green' : 'text-red',
            )}
          >
            {shownDelta >= 0 ? '+' : ''}
            {shownDelta.toFixed(1)}%
          </div>
        </div>
      </div>
      {projection ? (
        <>
          <ConfidenceGauge confidence={projection.confidence} />
          <PredictionMeta
            left={`From ${formatPrice(asset.current_price)}`}
            right={`Confidence ${projection.confidence}%`}
          />
        </>
      ) : (
        <PredictionMeta left="Live price · 24h change" right="Click to forecast" />
      )}
    </button>
  );
}
