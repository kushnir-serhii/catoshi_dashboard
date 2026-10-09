'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_HEIGHT, CHART_Y_AXIS_WIDTH } from '@/consts/projectionChart';
import { MIN_PX_PER_POINT } from '@/consts/projections';
import type { ChartRow } from '@/lib/projectionSeries';
import { computeYDomain } from '@/lib/projectionSeries';
import { cn } from '@/utils/cn';

import { ChartTooltip } from './ChartTooltip';
import { ConfidenceBand } from './ConfidenceBand';
import { useContainerHeight, useContainerWidth } from './useContainerSize';
import { buildFallbackRows, formatDateTick } from './utils';
import { YAxisOverlay } from './YAxisOverlay';

const FALLBACK_ROWS = buildFallbackRows();
const FALLBACK_Y_DOMAIN = computeYDomain(FALLBACK_ROWS);

export function ProjectionChart({
  glow: _glow = 1,
  rows,
  yDomain,
  // Freshness audit (spec 017, Slice 2): this is a default for a "where is the
  // present moment on the time axis" marker, not a displayed timestamp. Real
  // callers (`useProjectionChart`) pass a value derived from the forecast /
  // price data; the `Date.now()` default only applies to decorative usage with
  // no data at all (e.g. the landing page).
  todayMs = Date.now(),
  interactive = true,
}: {
  width?: number;
  height?: number;
  glow?: number;
  rows?: ChartRow[];
  yDomain?: [number, number];
  todayMs?: number;
  /** Disable wheel-zoom and horizontal scroll — for static/decorative usage
   * (e.g. the marketing landing page) where the chart shouldn't hijack the
   * page's scroll gesture. */
  interactive?: boolean;
}) {
  const chartRows = rows && rows.length > 0 ? rows : FALLBACK_ROWS;
  const chartYDomain =
    rows && rows.length > 0 ? (yDomain ?? computeYDomain(rows)) : FALLBACK_Y_DOMAIN;

  const xDomain = useMemo<[number, number]>(() => {
    if (chartRows.length === 0) return [0, 1];
    return [chartRows[0].t, chartRows[chartRows.length - 1].t];
  }, [chartRows]);

  const [scrollRef, containerWidth] = useContainerWidth<HTMLDivElement>();
  const [heightRef, containerHeight] = useContainerHeight<HTMLDivElement>();
  const chartHeight = containerHeight > 0 ? containerHeight : CHART_HEIGHT;
  const baseWidth = Math.max(containerWidth, chartRows.length * MIN_PX_PER_POINT);

  // Binance-style scroll-to-zoom: mouse wheel over the chart stretches/shrinks
  // the plot horizontally, keeping the data point under the cursor stationary.
  const [zoom, setZoom] = useState(1);
  const wheelAnchorRef = useRef<{ frac: number; offsetX: number } | null>(null);
  const plotWidth = baseWidth * zoom;
  // Read inside the native listener below without re-subscribing it on every
  // width/zoom change (see effect comment).
  const plotWidthRef = useRef(plotWidth);
  plotWidthRef.current = plotWidth;

  // React's synthetic `onWheel` is registered passive by default, so
  // `e.preventDefault()` inside a JSX handler is silently ignored and the
  // page scrolls anyway. A native, non-passive listener is required to
  // actually stop page scroll while the cursor is over the chart.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !interactive) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY === 0 || !container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const oldWidth = container.scrollWidth || plotWidthRef.current;
      wheelAnchorRef.current = { frac: (container.scrollLeft + offsetX) / oldWidth, offsetX };
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => Math.min(8, Math.max(1, z * factor)));
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [scrollRef, interactive]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const anchor = wheelAnchorRef.current;
    if (!container || !anchor) return;
    container.scrollLeft = anchor.frac * container.scrollWidth - anchor.offsetX;
    wheelAnchorRef.current = null;
  }, [zoom, scrollRef]);

  return (
    <div ref={heightRef} className="relative h-full">
      <div
        ref={scrollRef}
        className={cn('overflow-y-hidden', interactive ? 'overflow-x-auto' : 'overflow-x-hidden')}
        style={{ paddingRight: CHART_Y_AXIS_WIDTH }}
      >
        <ComposedChart
          width={plotWidth}
          height={chartHeight}
          data={chartRows}
          margin={{ top: 16, right: 8, bottom: 26, left: 0 }}
        >
          <defs>
            <linearGradient id="rc-hist-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-bull)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--color-chart-bull)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            domain={xDomain}
            tickFormatter={formatDateTick}
            tickCount={Math.max(6, Math.round(plotWidth / 80))}
            minTickGap={40}
            axisLine={false}
            tickLine={false}
            height={28}
            tick={{
              fill: 'var(--color-text-3)',
              fontSize: 'var(--fs-sm)',
              fontFamily: 'var(--font-mono)',
            }}
          />

          <YAxis hide orientation="right" domain={chartYDomain} width={0} />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--color-line-2)', strokeWidth: 1 }}
            offset={12}
          />

          <Area
            dataKey="hist"
            type="linear"
            stroke="var(--color-chart-bull)"
            strokeWidth={1.8}
            fill="url(#rc-hist-fill)"
            dot={false}
            activeDot={{
              r: 4,
              fill: 'var(--color-chart-bull)',
              stroke: 'var(--color-bg)',
              strokeWidth: 2,
            }}
            connectNulls={false}
            isAnimationActive={false}
            legendType="none"
          />

          <ConfidenceBand rows={chartRows} />

          <ReferenceLine
            x={todayMs}
            stroke="var(--color-chart-base)"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: 'Today',
              position: 'insideTopLeft',
              fill: 'var(--color-chart-base)',
              fontSize: 'var(--fs-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          />

          <Line
            dataKey="bull"
            name="Bull case"
            type="linear"
            stroke="var(--color-chart-bull)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3, fill: 'var(--color-chart-bull)', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="base"
            name="Base case"
            type="linear"
            stroke="var(--color-chart-base)"
            strokeWidth={1.8}
            dot={false}
            activeDot={{
              r: 4,
              fill: 'var(--color-chart-base)',
              stroke: 'var(--color-bg)',
              strokeWidth: 2,
            }}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="bear"
            name="Bear case"
            type="linear"
            stroke="var(--color-chart-bear)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3, fill: 'var(--color-chart-bear)', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </div>

      <YAxisOverlay yDomain={chartYDomain} height={chartHeight} />
    </div>
  );
}
