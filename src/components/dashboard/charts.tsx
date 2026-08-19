'use client';

import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LegendPayload } from 'recharts';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
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
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Recharts sub-components ──────────────────────────────────────────────────

const YTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) => {
  if (!payload) return null;
  return (
    <text
      x={(x ?? 0) + 4}
      y={(y ?? 0) + 4}
      fill="var(--text-3)"
      style={{ fontSize: 12, fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)' }}
    >
      {formatPrice(payload.value)}
    </text>
  );
};

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
        fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
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

// ─── Legend ───────────────────────────────────────────────────────────────────

function ChartLegend({ payload }: { payload?: ReadonlyArray<LegendPayload> }) {
  if (!payload?.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'flex-end',
        paddingBottom: 6,
        fontSize: 11,
        fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
        color: 'var(--text-3)',
      }}
    >
      {payload.map((entry) => (
        <div key={entry.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.color,
              flexShrink: 0,
            }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

// ─── Main chart component ─────────────────────────────────────────────────────

export function ProjectionChart({
  glow: _glow = 1,
  rows,
  yDomain,
  todayMs = Date.now(),
}: {
  width?: number;
  height?: number;
  glow?: number;
  rows?: ChartRow[];
  yDomain?: [number, number];
  todayMs?: number;
}) {
  const chartRows = rows && rows.length > 0 ? rows : FALLBACK_ROWS;
  const chartYDomain =
    rows && rows.length > 0 ? (yDomain ?? computeYDomain(rows)) : FALLBACK_Y_DOMAIN;

  const xDomain = useMemo<[number, number]>(() => {
    if (chartRows.length === 0) return [0, 1];
    return [chartRows[0].t, chartRows[chartRows.length - 1].t];
  }, [chartRows]);

  const [scrollRef, containerWidth] = useContainerWidth<HTMLDivElement>();
  const plotWidth = Math.max(containerWidth, chartRows.length * MIN_PX_PER_POINT);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={scrollRef}
        style={{ overflowX: 'auto', overflowY: 'hidden', paddingRight: CHART_Y_AXIS_WIDTH }}
      >
        <ComposedChart
          width={plotWidth}
          height={CHART_HEIGHT}
          data={chartRows}
          margin={{ top: 16, right: 48, bottom: 26, left: 0 }}
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
            axisLine={false}
            tickLine={false}
            height={28}
            tick={{
              fill: 'var(--text-3)',
              fontSize: 12,
              fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
            }}
          />

          <YAxis hide orientation="right" domain={chartYDomain} width={0} />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }}
            offset={12}
          />

          <Legend verticalAlign="top" align="right" content={<ChartLegend />} />

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
              fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
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

      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: CHART_Y_AXIS_WIDTH,
          pointerEvents: 'none',
        }}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={chartRows} margin={{ top: 16, right: 0, bottom: 26, left: 0 }}>
            <YAxis
              orientation="right"
              domain={chartYDomain}
              tick={<YTick />}
              axisLine={false}
              tickLine={false}
              tickCount={5}
              width={CHART_Y_AXIS_WIDTH}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
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

// ─── HoldingsDonut ────────────────────────────────────────────────────────────

interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export function HoldingsDonut({
  size = 160,
  segments,
  glow = 1,
}: {
  size?: number;
  segments: DonutSegment[];
  glow?: number;
}) {
  const cx = size / 2,
    cy = size / 2;
  const r = size / 2 - 12;
  const inner = r - 14;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = -Math.PI / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ filter: `drop-shadow(0 0 ${10 * glow}px oklch(0.6 0.22 295 / ${0.35 * glow}))` }}
    >
      <circle cx={cx} cy={cy} r={r + 1} fill="none" stroke="rgba(255,255,255,0.04)" />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const a0 = acc;
        const a1 = acc + frac * Math.PI * 2;
        acc = a1;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0),
          y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1),
          y1 = cy + r * Math.sin(a1);
        const x0i = cx + inner * Math.cos(a1),
          y0i = cy + inner * Math.sin(a1);
        const x1i = cx + inner * Math.cos(a0),
          y1i = cy + inner * Math.sin(a0);
        return (
          <path
            key={i}
            d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x0i} ${y0i} A ${inner} ${inner} 0 ${large} 0 ${x1i} ${y1i} Z`}
            fill={s.color}
            opacity="0.95"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={inner - 1} fill="none" stroke="rgba(255,255,255,0.04)" />
    </svg>
  );
}
