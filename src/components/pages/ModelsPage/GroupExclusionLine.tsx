import { Muted } from '@/components/ui';
import type { ModelCalibrationGroup } from '@/data/types';

export function GroupExclusionLine({ group }: { group: ModelCalibrationGroup }) {
  if (group.excludedCount === 0) {
    return (
      <Muted as="p" className="mt-3">
        No resolved outcomes were set aside for this series.
      </Muted>
    );
  }
  const parts: string[] = [];
  if (group.excludedUnlinked > 0) parts.push(`${group.excludedUnlinked} with no linked snapshot`);
  if (group.excludedBackfilled > 0)
    parts.push(`${group.excludedBackfilled} on a back-filled snapshot`);
  if (group.excludedUnscoreable > 0) parts.push(`${group.excludedUnscoreable} unscoreable`);
  return (
    <Muted as="p" className="mt-3">
      {group.excludedCount} of {group.totalOutcomes} resolved outcomes set aside
      {parts.length > 0 ? `: ${parts.join(', ')}` : ''}.
    </Muted>
  );
}
