import { Muted } from '@/components/ui';
import { MIN_SCORED_SAMPLE_SIZE, NO_SKILL_BRIER_BASELINE } from '@/consts/scoring';
import type { ModelCalibrationGroup } from '@/data/types';
import { buildHorizonBreakdown, formatHorizonCounts } from '@/lib/scoring/horizonBreakdown';
import { cn } from '@/utils/cn';

import { CardBox } from './CardBox';
import { GroupExclusionLine } from './GroupExclusionLine';
import { HorizonBreakdown } from './HorizonBreakdown';
import { TrendSection } from './TrendSection';

export function GroupCard({ group }: { group: ModelCalibrationGroup }) {
  const header = (
    <div className="mb-4 flex flex-wrap items-baseline gap-2">
      <span className="text-text text-sm font-medium">{group.model}</span>
      <span className="rounded-pill bg-surface-3 text-text-3 px-2 py-0.5 font-mono text-sm leading-(--lh-normal)">
        prompt {group.promptVersion}
      </span>
    </div>
  );

  // Below the minimum sample size the page reports the count, never a mean
  // (functional-spec 2.7). This is the expected early state.
  if (group.meanBrier === null || group.scoredCount < MIN_SCORED_SAMPLE_SIZE) {
    return (
      <CardBox>
        {header}
        <p className="text-text text-sm leading-(--lh-normal)">
          {group.scoredCount} forecast{group.scoredCount === 1 ? '' : 's'} resolved, too few to
          report accuracy — {MIN_SCORED_SAMPLE_SIZE} scored outcomes are needed before a mean Brier
          score is more signal than noise.
        </p>
        <Muted as="p" className="mt-1">
          {formatHorizonCounts(buildHorizonBreakdown(group.byHorizon))}
        </Muted>
        <GroupExclusionLine group={group} />
      </CardBox>
    );
  }

  const beating = group.meanBrier < NO_SKILL_BRIER_BASELINE;
  const delta = Math.abs(group.meanBrier - NO_SKILL_BRIER_BASELINE);
  const toneClass = beating ? 'text-green' : 'text-red';

  return (
    <CardBox>
      {header}
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <Muted as="div" className="mb-0.5">
            Mean Brier score
          </Muted>
          <div className={cn('text-xl leading-(--lh-tight) font-medium tabular-nums', toneClass)}>
            {group.meanBrier.toFixed(3)}
          </div>
        </div>
        <div>
          <Muted as="div" className="mb-0.5">
            No-skill baseline
          </Muted>
          <div className="text-text-3 text-xl leading-(--lh-tight) font-normal tabular-nums">
            {NO_SKILL_BRIER_BASELINE.toFixed(3)}
          </div>
        </div>
      </div>
      <p className={cn('mt-3 text-sm leading-(--lh-normal)', toneClass)}>
        {beating ? 'Beating' : 'Below'} the no-skill baseline by {delta.toFixed(3)}
      </p>
      <Muted as="p" className="mt-1">
        Based on {group.scoredCount} scored outcome{group.scoredCount === 1 ? '' : 's'}.
      </Muted>

      <HorizonBreakdown group={group} />

      {group.trend.length > 0 && <TrendSection trend={group.trend} />}

      <GroupExclusionLine group={group} />
    </CardBox>
  );
}
