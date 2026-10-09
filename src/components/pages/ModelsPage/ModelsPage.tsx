'use client';

import { Notice } from '@/components/ui';
import { useModels } from '@/hooks/useModels';

import { ExclusionsSummary } from './ExclusionsSummary';
import { GroupCard } from './GroupCard';
import { ModelsCard } from './ModelsCard';
import { PageSkeleton } from './PageSkeleton';

export function ModelsPage() {
  const { groups, exclusions, fetchError, isLoading, isStale } = useModels();

  const hasAnyOutcome = groups.length > 0 || (exclusions?.totalOutcomes ?? 0) > 0;

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
      <h1 className="sr-only">Forecast accuracy</h1>
      {isStale && (
        <div
          role="status"
          className="border-notice-border bg-surface-3 text-notice mb-3 rounded border px-4 py-2 text-sm leading-(--lh-normal)"
        >
          Data may be outdated
        </div>
      )}

      {isLoading ? (
        <PageSkeleton />
      ) : fetchError ? (
        <ModelsCard title="Forecast accuracy">
          <Notice
            tone="error"
            padding="lg"
            title="Calibration data could not be read"
            body="The forecast-scoring store is unavailable, so no accuracy figures can be shown. This is not a measured result — check back shortly."
          />
        </ModelsCard>
      ) : !hasAnyOutcome ? (
        <ModelsCard title="Forecast accuracy">
          <Notice
            tone="neutral"
            padding="lg"
            title="No forecasts have been resolved yet"
            body="The system has not yet measured any forecast accuracy. Scores will appear here once forecasts reach their horizon and are scored against real prices."
          />
        </ModelsCard>
      ) : (
        <>
          <ModelsCard title="Forecast accuracy, by model and prompt version">
            <div className="grid gap-4">
              {groups.map((group) => (
                <GroupCard key={`${group.model}::${group.promptVersion}`} group={group} />
              ))}
            </div>
          </ModelsCard>
          {exclusions && <ExclusionsSummary exclusions={exclusions} />}
        </>
      )}
    </div>
  );
}
