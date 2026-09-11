'use client';

import { Surface } from '@heroui/react';

import { SparklineChart } from '@/components/dashboard/SparklineChart';
import type { KPIsProps } from '@/data/types';

export function KPIs({ items, isLoading, isStale, countdown }: KPIsProps) {
  return (
    <Surface className="card padless area-kpis">
      <div className="kpis">
        {items.map((k, i) => (
          <div className="kpi relative" key={i}>
            <div className="lbl">{k.lbl}</div>

            {isLoading ? (
              <>
                <div className="mb-1 h-6 w-24 animate-pulse rounded-sm bg-surface-3" />
                <div className="h-4 w-16 animate-pulse rounded-sm bg-surface-2" />
              </>
            ) : (
              <>
                <div className="val tnum">{k.val}</div>
                <div className="sub">
                  <span className={k.deltaClass}>{k.deltaText}</span>
                  {k.subText && <span className="muted">{k.subText}</span>}
                </div>
              </>
            )}

            {k.sparkline && k.sparkline.length > 0 && (
              <div className="micro">
                <SparklineChart
                  prices={k.sparkline}
                  isPositive={
                    k.sparkline.length > 1 && k.sparkline[k.sparkline.length - 1] >= k.sparkline[0]
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && (
        <div
          role="status"
          className="flex items-center gap-2 border-t border-(--line) px-4 py-2 text-xs text-(--text-3) tabular-nums"
        >
          {isStale && <span style={{ color: 'var(--warning)' }}>Data may be outdated</span>}
          <span className="ml-auto">Refreshes in {countdown}s</span>
        </div>
      )}
    </Surface>
  );
}
