import type { ChartRow } from '@/lib/projectionSeries';
import { formatPrice } from '@/lib/projectionSeries';

import { ChartTooltipBox } from './ChartTooltipBox';

export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isForecast = d.bull != null;
  return (
    <ChartTooltipBox>
      <div className="text-text-3 mb-0.5">
        {new Date(d.t).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </div>
      {d.hist != null && <div className="text-chart-bull">{formatPrice(d.hist)}</div>}
      {isForecast && (
        <>
          <div className="text-chart-bull opacity-90">Bull {formatPrice(d.bull!)}</div>
          <div className="text-chart-base">Base {formatPrice(d.base!)}</div>
          <div className="text-chart-bear opacity-90">Bear {formatPrice(d.bear!)}</div>
        </>
      )}
    </ChartTooltipBox>
  );
}
