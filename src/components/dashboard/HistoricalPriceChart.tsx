'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { HistoricalPrice } from '@/data/types';
import { useHistoricalPrices } from '@/hooks/useHistoricalPrices';
import { useCoinSearch } from '@/hooks/useCoinSearch';
import { HISTORY_DAYS_OPTIONS } from '@/consts/prices';

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN = 'oklch(0.86 0.20 145)';

const RANGE_LABELS: Record<number, string> = {
  7: '7D',
  30: '30D',
  90: '90D',
  365: '1Y',
};

// ─── Data transform ───────────────────────────────────────────────────────────

type ChartPoint = { date: string; price: number };

function toChartPoints(prices: HistoricalPrice[]): ChartPoint[] {
  return prices.map(({ timestamp, price }) => ({
    date: new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    price,
  }));
}

// ─── X-axis tick density helper ───────────────────────────────────────────────

function buildXTicks(data: ChartPoint[], days: number): string[] {
  if (data.length === 0) return [];
  const count = days <= 7 ? 7 : days <= 30 ? 6 : days <= 90 ? 6 : 6;
  const step = Math.max(1, Math.floor(data.length / (count - 1)));
  const ticks: string[] = [];
  for (let i = 0; i < data.length; i += step) {
    ticks.push(data[i].date);
  }
  const last = data[data.length - 1].date;
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
}

// ─── Y-axis formatter ─────────────────────────────────────────────────────────

function fmtYAxis(value: number): string {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return '$' + Math.round(value / 1_000) + 'K';
  return '$' + value.toFixed(0);
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

type TooltipPayloadEntry = { payload: ChartPoint };

function PriceTooltip({
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
      <div style={{ color: GREEN }}>{formatted}</div>
      <div style={{ color: 'var(--text-3)' }}>{point.date}</div>
    </div>
  );
}

// ─── Y-axis custom tick ───────────────────────────────────────────────────────

function YTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
}) {
  if (!payload) return null;
  return (
    <text
      x={(x ?? 0) + 4}
      y={(y ?? 0) + 4}
      fill="var(--text-3)"
      style={{
        fontSize: 11,
        fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
      }}
    >
      {fmtYAxis(payload.value)}
    </text>
  );
}

// ─── X-axis custom tick ───────────────────────────────────────────────────────

function XTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  if (!payload?.value) return null;
  return (
    <text
      x={x}
      y={(y ?? 0) + 14}
      textAnchor="middle"
      fill="var(--text-3)"
      style={{
        fontSize: 11,
        fontFamily: 'var(--font-geist-mono, "Geist Mono", monospace)',
      }}
    >
      {payload.value}
    </text>
  );
}

// ─── localStorage persistence ─────────────────────────────────────────────────

type ChartPrefs = { coinId: string; days: number };

const STORAGE_KEY = 'catoshi:chart-prefs';
const DEFAULT_PREFS: ChartPrefs = { coinId: 'bitcoin', days: 30 };

function readPrefs(): ChartPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return JSON.parse(raw) as ChartPrefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HistoricalPriceChart() {
  const [prefs, setPrefs] = useState<ChartPrefs>(() => readPrefs());
  const { coinId, days } = prefs;

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const { search } = useCoinSearch();
  const searchResults = useMemo(() => search(searchQuery), [search, searchQuery]);

  function updatePrefs(next: Partial<ChartPrefs>) {
    setPrefs(prev => {
      const updated = { ...prev, ...next };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // private browsing / quota exceeded — silently ignore
      }
      return updated;
    });
  }

  const { data: rawPrices, isLoading, error, mutate } = useHistoricalPrices(coinId, days);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!rawPrices) return [];
    return toChartPoints(rawPrices);
  }, [rawPrices]);

  const xTicks = useMemo(() => buildXTicks(chartData, days), [chartData, days]);

  const [yMin, yMax] = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    const prices = chartData.map((d) => d.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }, [chartData]);

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="marker green" />
          Price history
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Coin search */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              placeholder={coinId}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 11,
                fontFamily: 'inherit',
                padding: '5px 10px',
                outline: 'none',
                width: 100,
              }}
            />
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 100,
                background: 'var(--surface-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 8,
                minWidth: 180,
                maxHeight: 200,
                overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              }}>
                {searchResults.map((coin) => (
                  <button
                    key={coin.id}
                    onMouseDown={() => {
                      updatePrefs({ coinId: coin.id });
                      setSearchQuery('');
                      setShowDropdown(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    <span style={{ color: 'var(--text-2)', marginRight: 8, textTransform: 'uppercase', fontSize: 10 }}>
                      {coin.symbol}
                    </span>
                    {coin.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Range tabs */}
          <div className="chart-tabs">
            {HISTORY_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                className={days === d ? 'active' : ''}
                onClick={() => updatePrefs({ days: d })}
              >
                {RANGE_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Skeleton loading state */}
      {isLoading && (
        <div
          style={{
            height: 320,
            borderRadius: 'var(--radius)',
            background: 'var(--surface-3)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
          className="animate-pulse"
        />
      )}

      {/* Error state — only when no prior data available */}
      {!isLoading && error && !rawPrices && (
        <div
          style={{
            height: 320,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--text-2)',
            fontSize: 13,
          }}
        >
          <span>Failed to load price history.</span>
          <button className="btn-ghost" onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      )}

      {/* Chart — render when data is available (cached data shows even if latest fetch errored) */}
      {!isLoading && rawPrices && (
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={chartData}
              margin={{ top: 16, right: 48, bottom: 26, left: 0 }}
            >
              <defs>
                <linearGradient id="hist-area-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="rgba(255,255,255,0.04)"
                strokeDasharray="2 4"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                ticks={xTicks}
                tick={<XTick />}
                axisLine={false}
                tickLine={false}
                height={28}
                interval={0}
              />

              <YAxis
                orientation="right"
                domain={[yMin, yMax]}
                tick={<YTick />}
                axisLine={false}
                tickLine={false}
                tickCount={5}
                width={48}
              />

              <Tooltip
                content={<PriceTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1 }}
              />

              <Area
                dataKey="price"
                type="linear"
                stroke={GREEN}
                strokeWidth={1.8}
                fill="url(#hist-area-fill)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: GREEN,
                  stroke: '#0a0a12',
                  strokeWidth: 2,
                }}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
