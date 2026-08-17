'use client';

import { Surface } from '@heroui/react';
import { Sparkline } from '@/components/dashboard/charts';
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
                <div className="animate-pulse bg-gray-700 rounded h-6 w-24 mb-1" />
                <div className="animate-pulse bg-gray-600 rounded h-4 w-16" />
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

            {k.sparkSeed !== undefined && k.sparkColor && (
              <div className="micro">
                <Sparkline width={70} height={28} seed={k.sparkSeed} color={k.sparkColor} />
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-(--line) text-xs text-(--text-3) tabular-nums">
          {isStale && (
            <span style={{ color: 'var(--warning)' }}>Data may be outdated</span>
          )}
          <span className="ml-auto">Refreshes in {countdown}s</span>
        </div>
      )}
    </Surface>
  );
}
