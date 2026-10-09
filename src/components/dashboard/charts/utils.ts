import type { ChartRow } from '@/lib/projectionSeries';

export type Timeframe = '1W' | '1M' | '3M' | '6M' | '1Y' | 'All';

const MS_PER_DAY = 86_400_000;

export function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const formatDateTick = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

/** Evenly-spaced tick values across `[min, max]`, inclusive of both ends. */
export function computeYTicks([min, max]: [number, number], count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

// ─── Seeded fallback data (used only when no real rows are supplied) ──────────

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

export function buildFallbackRows(): ChartRow[] {
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here.
  // These rows are the fully synthetic mock projection used only when no real
  // data is present — there is no data timestamp to anchor to, and the x-axis
  // just needs "history ending around now, forecast running forward". Nothing
  // in this path presents a "last updated" claim.
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
