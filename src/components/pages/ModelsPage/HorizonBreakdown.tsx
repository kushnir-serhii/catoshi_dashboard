import { Muted } from '@/components/ui';
import type { ModelCalibrationGroup } from '@/data/types';
import { buildHorizonBreakdown, horizonLabel } from '@/lib/scoring/horizonBreakdown';
import { cn } from '@/utils/cn';

export function HorizonBreakdown({ group }: { group: ModelCalibrationGroup }) {
  return (
    <div className="mt-4">
      <Muted as="div" className="mb-2">
        By horizon
      </Muted>
      <div className="flex flex-wrap gap-4">
        {buildHorizonBreakdown(group.byHorizon).map((entry) => (
          <div key={entry.horizonDays} className="min-w-0 flex-[1_1_140px]">
            <Muted as="div">{horizonLabel(entry.horizonDays)}</Muted>
            {entry.state === 'scored' ? (
              <>
                <div
                  className={cn(
                    'text-lg leading-(--lh-tight) font-medium tabular-nums',
                    entry.beating ? 'text-green' : 'text-red',
                  )}
                >
                  {entry.meanBrier.toFixed(3)}
                </div>
                <div
                  className={cn(
                    'text-sm leading-(--lh-normal)',
                    entry.beating ? 'text-green' : 'text-red',
                  )}
                >
                  {entry.beating ? 'Beating' : 'Below'} by {entry.delta.toFixed(3)}
                </div>
                <Muted as="div">{entry.scoredCount} scored</Muted>
              </>
            ) : (
              <Muted as="div">{entry.scoredCount} scored · not enough yet</Muted>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
