import { useMemo } from 'react';
import { useXAxisScale, useYAxisScale } from 'recharts';

import type { ChartRow } from '@/lib/projectionSeries';

/** Fill between the bull and bear lines. */
export function ConfidenceBand({ rows }: { rows: ChartRow[] }) {
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

  return <path d={d} fill="var(--color-chart-base-fill)" stroke="none" />;
}
