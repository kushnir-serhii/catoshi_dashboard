import type { ReactNode } from 'react';

import { Muted } from '@/components/ui';
import { GLOW_TEXT_VIOLET } from '@/consts/panelStyles';
import type { HistChange } from '@/hooks/useProjectionChart';
import { formatPrice } from '@/lib/projectionSeries';
import { cn } from '@/utils/cn';

interface PriceRowProps {
  livePrice: number | undefined;
  histChange: HistChange;
  /** Right-aligned actions (snapshot / reforecast); hidden on phones. */
  actions?: ReactNode;
}

export function PriceRow({ livePrice, histChange, actions }: PriceRowProps) {
  const isUp = histChange.abs >= 0;

  return (
    <div className="mb-2 flex items-baseline gap-4 max-sm:flex-wrap max-sm:gap-x-3 max-sm:gap-y-1">
      <div
        className={cn(
          'text-xl font-medium tracking-(--ls-tight) tabular-nums max-sm:text-lg',
          GLOW_TEXT_VIOLET,
        )}
      >
        {livePrice !== undefined ? formatPrice(livePrice) : '$—'}
      </div>
      {histChange.label && (
        <>
          <div className={cn('font-mono', isUp ? 'text-green' : 'text-red')}>
            {isUp ? '+' : '−'} $
            {Math.abs(histChange.abs).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            · {Math.abs(histChange.pct).toFixed(2)}%
          </div>
          <Muted as="div" className="max-sm:hidden">
            {histChange.label}
          </Muted>
        </>
      )}
      <div className="ml-auto flex items-center gap-2 max-sm:hidden">{actions}</div>
    </div>
  );
}
