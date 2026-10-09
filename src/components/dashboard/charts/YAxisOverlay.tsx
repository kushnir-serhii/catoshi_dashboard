import {
  CHART_MARGIN_BOTTOM,
  CHART_MARGIN_TOP,
  CHART_Y_AXIS_WIDTH,
  Y_TICK_COUNT,
} from '@/consts/projectionChart';
import { formatPrice } from '@/lib/projectionSeries';

import { computeYTicks } from './utils';

/** Y-axis drawn in plain HTML, not Recharts, so it renders reliably pinned to
 * the right edge while the plot scrolls beneath it. */
export function YAxisOverlay({ yDomain, height }: { yDomain: [number, number]; height: number }) {
  const ticks = computeYTicks(yDomain, Y_TICK_COUNT);
  const [min, max] = yDomain;
  const plotHeight = height - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM;

  return (
    <div
      className="pointer-events-none absolute top-0 right-0"
      style={{ width: CHART_Y_AXIS_WIDTH, height }}
    >
      {ticks.map((v, i) => {
        const frac = max === min ? 0.5 : (v - min) / (max - min);
        const top = CHART_MARGIN_TOP + (1 - frac) * plotHeight;
        return (
          <span
            key={i}
            className="text-text-3 absolute left-1.5 -translate-y-1/2 font-mono text-sm whitespace-nowrap"
            style={{ top }}
          >
            {formatPrice(v)}
          </span>
        );
      })}
    </div>
  );
}
