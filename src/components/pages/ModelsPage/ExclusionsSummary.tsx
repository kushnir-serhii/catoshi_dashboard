import { Muted } from '@/components/ui';
import type { ModelsExclusionSummary } from '@/data/types';

import { CardBox } from './CardBox';
import { ModelsCard } from './ModelsCard';

export function ExclusionsSummary({ exclusions }: { exclusions: ModelsExclusionSummary }) {
  return (
    <ModelsCard title="What was set aside">
      <CardBox>
        <Muted as="p">
          {exclusions.totalOutcomes} resolved outcome{exclusions.totalOutcomes === 1 ? '' : 's'} in
          total. {exclusions.scoredCount} counted toward a score; {exclusions.excludedCount}{' '}
          excluded — {exclusions.excludedUnlinked} with no linked snapshot,{' '}
          {exclusions.excludedBackfilled} linked to a back-filled snapshot,{' '}
          {exclusions.excludedUnscoreable} unscoreable (no realized scenario or no probabilities).
        </Muted>
      </CardBox>
    </ModelsCard>
  );
}
