import { Muted } from '@/components/ui';
import type { ModelTrendPoint } from '@/data/types';

import { BrierTrend } from './BrierTrend';

function formatMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function TrendSection({ trend }: { trend: ModelTrendPoint[] }) {
  return (
    <div className="mt-4">
      <Muted as="div" className="mb-2">
        Trend by month (lower is better; goal is a score that falls)
      </Muted>
      <BrierTrend points={trend} />
      <div className="mt-2 flex flex-wrap gap-4">
        {trend.map((p) => (
          <Muted key={p.month} className="font-mono">
            {formatMonth(p.month)}: {p.meanBrier.toFixed(3)} (n={p.scoredCount})
          </Muted>
        ))}
      </div>
    </div>
  );
}
