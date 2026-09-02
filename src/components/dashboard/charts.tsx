'use client';

import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from 'recharts';

import { MIN_PX_PER_POINT } from '@/consts/projections';
import type { ChartRow } from '@/lib/projectionSeries';
import { computeYDomain, formatPrice } from '@/lib/projectionSeries';

// ─── Container width measurement (for horizontal-scroll sizing) ───────────────

function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Mirrors `useContainerWidth` but for height — used so the chart can size
 * itself to whatever height its `.chart-stage` wrapper is given at the
 * current breakpoint (e.g. shrunk on mobile) instead of a fixed constant. */
function useContainerHeight<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
}

// ─── Seeded fallback data (used only when no real rows are supplied) ──────────

const MS_PER_DAY = 86_400_000;

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateProjection(): { hist: number[]; bull: number[]; base: number[]; bear: number[] } {
  const rnd = seededRand(42);
  const hist: number[] = [];
  let v = 62000;
  for (let i = 0; i < 90; i++) {
    v *= 1 + (rnd() - 0.48) * 0.022;
    hist.push(v);
  }
  const last = hist[hist.length - 1];
  const bull = [last],
    base = [last],
    bear = [last];
  for (let i = 1; i < 60; i++) {
    const noise = (rnd() - 0.5) * 0.012;
    bull.push(bull[i - 1] * (1 + 0.0058 + noise));
    base.push(base[i - 1] * (1 + 0.0021 + noise));
    bear.push(bear[i - 1] * (1 - 0.0014 + noise));
  }
  return { hist, bull, base, bear };
}

const PROJ = generateProjection();

function buildFallbackRows(): ChartRow[] {
  const todayTs = Date.now();
  const rows: ChartRow[] = [];

  PROJ.hist.forEach((v, i) => {
    const isLast = i === PROJ.hist.length - 1;
    const t = todayTs - (PROJ.hist.length - 1 - i) * MS_PER_DAY;
    rows.push({
      t,
      hist: v,
      ...(isLast ? { bull: PROJ.bull[0], base: PROJ.base[0], bear: PROJ.bear[0] } : {}),
    });
  });

  for (let j = 1; j < PROJ.bull.length; j++) {
    rows.push({
      t: todayTs + j * MS_PER_DAY,
      bull: PROJ.bull[j],
      base: PROJ.base[j],
      bear: PROJ.bear[j],
    });
  }

  return rows;
}

const FALLBACK_ROWS = buildFallbackRows();
const FALLBACK_Y_DOMAIN = computeYDomain(FALLBACK_ROWS);

// ─── Chart types ──────────────────────────────────────────────────────────────

export type Timeframe = '1W' | '1M' | '3M' | '6M' | '1Y' | 'All';

const CHART_HEIGHT = 320;
const CHART_Y_AXIS_WIDTH = 56;

const formatDateTick = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

// Mirrors the ComposedChart's own margin so the manually-drawn Y-axis overlay
// (below) lines up pixel-for-pixel with the plot area inside the SVG.
const CHART_MARGIN_TOP = 16;
const CHART_MARGIN_BOTTOM = 26;

const Y_TICK_COUNT = 5;

/** Evenly-spaced tick values across `[min, max]`, inclusive of both ends. */
function computeYTicks([min, max]: [number, number], count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

// ─── Y-axis overlay (drawn in plain HTML, not Recharts, so it renders
// reliably pinned to the right edge while the plot scrolls beneath it) ────────

function YAxisOverlay({ yDomain, height }: { yDomain: [number, number]; height: number }) {
  const ticks = computeYTicks(yDomain, Y_TICK_COUNT);
  const [min, max] = yDomain;
  const plotHeight = height - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: CHART_Y_AXIS_WIDTH,
        height,
        pointerEvents: 'none',
      }}
    >
      {ticks.map((v, i) => {
        const frac = max === min ? 0.5 : (v - min) / (max - min);
        const top = CHART_MARGIN_TOP + (1 - frac) * plotHeight;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top,
              left: 6,
              transform: 'translateY(-50%)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-3)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatPrice(v)}
          </span>
        );
      })}
    </div>
  );
}

// ─── Recharts sub-components ──────────────────────────────────────────────────

function ChartTooltip({
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
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text)',
        lineHeight: 1.9,
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>
        {new Date(d.t).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </div>
      {d.hist != null && <div style={{ color: 'oklch(0.86 0.20 145)' }}>{formatPrice(d.hist)}</div>}
      {isForecast && (
        <>
          <div style={{ color: 'oklch(0.86 0.20 145)', opacity: 0.9 }}>
            Bull {formatPrice(d.bull!)}
          </div>
          <div style={{ color: 'oklch(0.78 0.22 295)' }}>Base {formatPrice(d.base!)}</div>
          <div style={{ color: 'oklch(0.65 0.18 25)', opacity: 0.9 }}>
            Bear {formatPrice(d.bear!)}
          </div>
        </>
      )}
      {d.scenario != null && (
        <div style={{ color: 'oklch(0.80 0.18 85)' }}>Your scenario {formatPrice(d.scenario)}</div>
      )}
    </div>
  );
}

// ─── Confidence band (fill between bull and bear lines) ───────────────────────

function ConfidenceBand({ rows }: { rows: ChartRow[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();

  const points = useMemo(() => {
    if (!xScale || !yScale) return [];
    return rows
      .filter(
        (r): r is ChartRow & { bull: number; bear: number } => r.bull != null && r.bear != null,
      )
      .map((r) => ({
        x: xScale(r.t),
        top: yScale(r.bull),
        bottom: yScale(r.bear),
      }))
      .filter(
        (p): p is { x: number; top: number; bottom: number } =>
          typeof p.x === 'number' && typeof p.top === 'number' && typeof p.bottom === 'number',
      );
  }, [rows, xScale, yScale]);

  if (points.length < 2) return null;

  const topPath = points.map((p) => `${p.x},${p.top}`).join(' L ');
  const bottomPath = points
    .slice()
    .reverse()
    .map((p) => `${p.x},${p.bottom}`)
    .join(' L ');
  const d = `M ${topPath} L ${bottomPath} Z`;

  return <path d={d} fill="oklch(0.78 0.22 295 / 0.10)" stroke="none" />;
}

// ─── Main chart component ─────────────────────────────────────────────────────

export function ProjectionChart({
  glow: _glow = 1,
  rows,
  yDomain,
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
    <div ref={heightRef} style={{ position: 'relative', height: '100%' }}>
      <div
        ref={scrollRef}
        style={{
          overflowX: interactive ? 'auto' : 'hidden',
          overflowY: 'hidden',
          paddingRight: CHART_Y_AXIS_WIDTH,
        }}
      >
        <ComposedChart
          width={plotWidth}
          height={chartHeight}
          data={chartRows}
          margin={{ top: 16, right: 8, bottom: 26, left: 0 }}
        >
          <defs>
            <linearGradient id="rc-hist-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.86 0.20 145)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="oklch(0.86 0.20 145)" stopOpacity={0} />
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
              fill: 'var(--text-3)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          />

          <YAxis hide orientation="right" domain={chartYDomain} width={0} />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }}
            offset={12}
          />

          <Area
            dataKey="hist"
            type="linear"
            stroke="oklch(0.86 0.20 145)"
            strokeWidth={1.8}
            fill="url(#rc-hist-fill)"
            dot={false}
            activeDot={{ r: 4, fill: 'oklch(0.86 0.20 145)', stroke: '#0a0a12', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
            legendType="none"
          />

          <ConfidenceBand rows={chartRows} />

          <ReferenceLine
            x={todayMs}
            stroke="oklch(0.78 0.22 295)"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: 'Today',
              position: 'insideTopLeft',
              fill: 'oklch(0.78 0.22 295)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          />

          <Line
            dataKey="bull"
            name="Bull case"
            type="linear"
            stroke="oklch(0.86 0.20 145)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3, fill: 'oklch(0.86 0.20 145)', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="base"
            name="Base case"
            type="linear"
            stroke="oklch(0.78 0.22 295)"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 4, fill: 'oklch(0.78 0.22 295)', stroke: '#0a0a12', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="bear"
            name="Bear case"
            type="linear"
            stroke="oklch(0.65 0.18 25)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3, fill: 'oklch(0.65 0.18 25)', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="scenario"
            name="Your scenario"
            type="linear"
            stroke="oklch(0.80 0.18 85)"
            strokeWidth={1.6}
            strokeDasharray="2 3"
            dot={false}
            activeDot={{ r: 3, fill: 'oklch(0.80 0.18 85)', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </div>

      <YAxisOverlay yDomain={chartYDomain} height={chartHeight} />
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({
  width = 110,
  height = 28,
  seed = 1,
  color = 'green',
}: {
  width?: number;
  height?: number;
  seed?: number;
  color?: 'green' | 'violet' | 'red';
}) {
  const rnd = seededRand(seed);
  const N = 28;
  let val = 50;
  const arr: number[] = [];
  for (let i = 0; i < N; i++) {
    val += (rnd() - 0.45) * 6;
    arr.push(val);
  }
  const min = Math.min(...arr),
    max = Math.max(...arr);
  const xPos = (i: number) => (i / (N - 1)) * (width - 2) + 1;
  const yPos = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const path = arr
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`)
    .join(' ');
  const stroke =
    color === 'violet'
      ? 'oklch(0.78 0.22 295)'
      : color === 'red'
        ? 'oklch(0.7 0.20 25)'
        : 'oklch(0.86 0.20 145)';
  const fillId = `sparkFill_${seed}_${color}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${xPos(N - 1).toFixed(1)} ${height} L ${xPos(0).toFixed(1)} ${height} Z`}
        fill={`url(#${fillId})`}
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}
