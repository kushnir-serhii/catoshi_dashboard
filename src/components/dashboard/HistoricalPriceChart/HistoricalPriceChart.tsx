'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton';
import { Button, Card, CardHeader, CardTitle, SegmentedTabs } from '@/components/ui';
import { HISTORY_DAYS_OPTIONS } from '@/consts/prices';
import { useHistoricalPrices } from '@/hooks/useHistoricalPrices';

import { CoinSearch } from './CoinSearch';
import { PriceTooltip } from './PriceTooltip';
import type { ChartPoint, ChartPrefs } from './utils';
import { buildXTicks, GREEN, RANGE_LABELS, readPrefs, STORAGE_KEY, toChartPoints } from './utils';
import { XTick } from './XTick';
import { YTick } from './YTick';

const RANGE_OPTIONS = HISTORY_DAYS_OPTIONS.map((d) => ({
  value: String(d),
  label: RANGE_LABELS[d],
}));

export function HistoricalPriceChart() {
  const [prefs, setPrefs] = useState<ChartPrefs>(() => readPrefs());
  const { coinId, days } = prefs;

  function updatePrefs(next: Partial<ChartPrefs>) {
    setPrefs((prev) => {
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
    <Card>
      {/* Header */}
      <CardHeader>
        <CardTitle marker="green">Price history</CardTitle>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <CoinSearch coinId={coinId} onSelect={(id) => updatePrefs({ coinId: id })} />

          {/* Range tabs */}
          <SegmentedTabs
            options={RANGE_OPTIONS}
            value={String(days)}
            onChange={(v) => updatePrefs({ days: Number(v) })}
          />
        </div>
      </CardHeader>

      {/* Skeleton loading state */}
      {isLoading && <ChartSkeleton />}

      {/* Error state — only when no prior data available */}
      {!isLoading && error && !rawPrices && (
        <div className="text-text-2 flex h-80 flex-col items-center justify-center gap-3 text-sm">
          <span>Failed to load price history.</span>
          <Button onClick={() => void mutate()}>Retry</Button>
        </div>
      )}

      {/* Chart — render when data is available (cached data shows even if latest fetch errored) */}
      {!isLoading && rawPrices && (
        <div className="h-80">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 16, right: 48, bottom: 26, left: 0 }}>
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
                cursor={{ stroke: 'var(--color-line-2)', strokeWidth: 1 }}
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
                  stroke: 'var(--color-bg)',
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
    </Card>
  );
}
