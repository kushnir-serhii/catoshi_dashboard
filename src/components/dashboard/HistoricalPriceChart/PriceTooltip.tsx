import { ChartTooltipBox } from '../charts/ChartTooltipBox';
import type { ChartPoint } from './utils';

type TooltipPayloadEntry = { payload: ChartPoint };

export function PriceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const formatted =
    '$' +
    point.price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <ChartTooltipBox>
      <div className="text-chart-bull">{formatted}</div>
      <div className="text-text-3">{point.date}</div>
    </ChartTooltipBox>
  );
}
