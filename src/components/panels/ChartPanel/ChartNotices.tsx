import { Button, Muted, Notice } from '@/components/ui';
import type { ForecastUnavailableReason } from '@/hooks/useProjectionChart';
import { formatPrice } from '@/lib/projectionSeries';

import { formatAge } from './utils';

const NOTICE_ACTION = 'px-3 py-0.5';

interface ChartNoticesProps {
  coinSymbol: string;
  isOffBatchCoin: boolean;
  forecastUnavailable: ForecastUnavailableReason;
  forecastAnchorPrice: number | undefined;
  isRefreshing: boolean;
  onReforecast: () => void;
  reforecastError: string | null;
  isStale: boolean;
  lastUpdatedAt: number | null;
  isRetrying: boolean;
  onRetry: () => void;
}

/** Stack of status banners above the chart. */
export function ChartNotices({
  coinSymbol,
  isOffBatchCoin,
  forecastUnavailable,
  forecastAnchorPrice,
  isRefreshing,
  onReforecast,
  reforecastError,
  isStale,
  lastUpdatedAt,
  isRetrying,
  onRetry,
}: ChartNoticesProps) {
  return (
    <>
      {isOffBatchCoin && (
        <Muted as="div" className="mb-3">
          Session-only: {coinSymbol} has no stored history, so this forecast isn&apos;t saved and
          won&apos;t survive a reload.
        </Muted>
      )}
      {forecastUnavailable !== null && (
        <Notice
          tone="selected"
          layout="inline"
          className="mb-3"
          action={
            <Button className={NOTICE_ACTION} onClick={onReforecast} disabled={isRefreshing}>
              {isRefreshing ? 'Reforecasting…' : 'Reforecast'}
            </Button>
          }
        >
          {forecastUnavailable === 'no-forecast'
            ? `No AI forecast for ${coinSymbol} yet — the bull/base/bear lines appear once one is generated.`
            : `Forecast hidden: it was generated around ${
                forecastAnchorPrice !== undefined
                  ? formatPrice(forecastAnchorPrice)
                  : 'an unknown price'
              }, too far from the live price to anchor. Reforecast to redraw the scenario lines.`}
        </Notice>
      )}
      {reforecastError && (
        <Notice
          tone="error"
          layout="inline"
          className="bg-chart-bear/15 border-chart-bear/35 text-coral mb-3"
        >
          {reforecastError}
        </Notice>
      )}
      {isStale && (
        <Notice
          tone="warning"
          layout="inline"
          className="mb-3"
          action={
            <Button className={NOTICE_ACTION} onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? 'Retrying…' : 'Retry'}
            </Button>
          }
        >
          Data may be outdated
          {lastUpdatedAt !== null ? ` — last updated ${formatAge(lastUpdatedAt)}` : ''}
        </Notice>
      )}
    </>
  );
}
