'use client';

import { HistoricalPriceChart } from '@/components/dashboard/HistoricalPriceChart';
import { KPIs } from '@/components/panels/KPIs';
import { marketAssets, marketKpis } from '@/data/markets';

import { LiveMarketsContent } from './LiveMarketsContent';
import { MarketsTable } from './MarketsTable';
import { SectorsCard } from './SectorsCard';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export function MarketsPage() {
  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
      <h1 className="sr-only">Markets</h1>
      <HistoricalPriceChart />

      <SectorsCard />

      {/* KPIs + Markets table */}
      {USE_MOCK ? (
        <>
          <KPIs items={marketKpis} isLoading={false} isStale={false} countdown={60} />
          <MarketsTable
            assets={marketAssets}
            liveAssets={null}
            prices={null}
            isLoading={false}
            isStale={false}
          />
        </>
      ) : (
        <LiveMarketsContent />
      )}
    </div>
  );
}
