'use client';

import { Card } from '@/components/ui';
import type { KPIsProps } from '@/data/types';

import { PanelStatusBar } from '../PanelStatusBar';
import { KpiCard } from './KpiCard';

export function KPIs({ items, isLoading, isStale, countdown }: KPIsProps) {
  return (
    <Card padless className="[grid-area:kpis]">
      <div className="grid grid-cols-4 overflow-hidden max-lg:grid-cols-2">
        {items.map((k, i) => (
          <KpiCard key={i} item={k} isLoading={isLoading} />
        ))}
      </div>

      {!isLoading && (
        <PanelStatusBar>
          {isStale && <span className="text-warning">Data may be outdated</span>}
          <span className="ml-auto">Refreshes in {countdown}s</span>
        </PanelStatusBar>
      )}
    </Card>
  );
}
