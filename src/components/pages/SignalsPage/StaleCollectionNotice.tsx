import { Notice } from '@/components/ui';
import { formatSnapshotAge } from '@/lib/freshness';

/**
 * Muted note shown when the newest snapshot behind the feed is older than
 * `SNAPSHOT_STALE_MINUTES` (spec 017, Slice 2). Deliberately NOT an error state:
 * the data on the page may still be the best available, it is just old, and the
 * honest thing is to say how old and that collection may have stalled — the
 * regression guard against a page that silently presents stale data as current
 * (`decisions.md` §3, instance 2).
 */
export function StaleCollectionNotice({ lastUpdated }: { lastUpdated: string }) {
  const age = formatSnapshotAge(lastUpdated);
  return (
    <Notice layout="inline" className="text-text-2 mb-3 rounded px-4">
      Data last updated {age ?? 'a while ago'} — collection may be stalled.
    </Notice>
  );
}
