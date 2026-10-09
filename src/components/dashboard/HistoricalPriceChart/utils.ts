import type { HistoricalPrice } from '@/data/types';

export const GREEN = 'var(--color-chart-bull)';

export const RANGE_LABELS: Record<number, string> = {
  7: '7D',
  30: '30D',
  90: '90D',
  365: '1Y',
};

// ─── Data transform ───────────────────────────────────────────────────────────

export type ChartPoint = { date: string; price: number };

export function toChartPoints(prices: HistoricalPrice[]): ChartPoint[] {
  return prices.map(({ timestamp, price }) => ({
    date: new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    price,
  }));
}

// ─── X-axis tick density helper ───────────────────────────────────────────────

export function buildXTicks(data: ChartPoint[], days: number): string[] {
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

export function fmtYAxis(value: number): string {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return '$' + Math.round(value / 1_000) + 'K';
  return '$' + value.toFixed(0);
}

// ─── localStorage persistence ─────────────────────────────────────────────────

export type ChartPrefs = { coinId: string; days: number };

export const STORAGE_KEY = 'catoshi:chart-prefs';
const DEFAULT_PREFS: ChartPrefs = { coinId: 'bitcoin', days: 30 };

export function readPrefs(): ChartPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return JSON.parse(raw) as ChartPrefs;
  } catch {
    return DEFAULT_PREFS;
  }
}
