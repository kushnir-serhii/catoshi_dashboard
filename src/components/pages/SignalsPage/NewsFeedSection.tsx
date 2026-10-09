import { NewsCard } from '@/components/signals';
import { Muted, Notice } from '@/components/ui';
import type { NewsSignalItem } from '@/data/types';
import { formatSnapshotAge } from '@/lib/freshness';
import {
  filterNewsByScope,
  newestNewsPublishedAt,
  newsEmptyStateCopy,
  type NewsScopeFilter,
} from '@/lib/news/feed';

import { NewsScopeFilter as NewsScopeFilterControl, SCOPE_LABELS } from './NewsScopeFilter';
import { SignalGrid } from './SignalGrid';

const PAUSED_BODY =
  'NEWS_CLASSIFY_ENABLED is off — no new headlines are being classified. Already-classified items above are unaffected; ingest and publishing continue.';

/**
 * The news section: a scope filter (all / market-wide / one asset) applied
 * client-side over the single unfiltered fetch, the true age of the newest
 * news item, and an explicit empty state. Never hidden, never backfilled with
 * expired items — the API already excludes those.
 */
export function NewsFeedSection({
  newsSignals,
  newsClassificationPaused,
  showStaleCollection,
  filter,
  onFilterChange,
}: {
  newsSignals: NewsSignalItem[];
  newsClassificationPaused: boolean;
  showStaleCollection: boolean;
  // Lifted to SignalsPage so a Pulse driver jump can reset it to 'all'.
  filter: NewsScopeFilter;
  onFilterChange: (f: NewsScopeFilter) => void;
}) {
  const visible = filterNewsByScope(newsSignals, filter);
  const newestAll = newestNewsPublishedAt(newsSignals);
  const newestAge = newestAll ? formatSnapshotAge(newestAll) : null;
  const emptyCopy = newsEmptyStateCopy(
    showStaleCollection,
    filter === 'all'
      ? 'No classified headline is currently within its impact horizon.'
      : `No live news signals for ${SCOPE_LABELS[filter]}.`,
  );
  const notice = newsClassificationPaused
    ? { title: 'News classification paused', body: PAUSED_BODY }
    : emptyCopy;

  return (
    <div className="mt-2">
      <div className="mx-1 mt-2 mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="m-0 text-lg">News signals</h2>
        {newestAge && <Muted>Newest news item: {newestAge}</Muted>}
        <NewsScopeFilterControl filter={filter} onFilterChange={onFilterChange} />
      </div>
      {visible.length === 0 ? (
        <Notice padding="md" title={notice.title} body={notice.body} />
      ) : (
        <SignalGrid>
          {visible.map((n) => (
            <NewsCard key={n.id} n={n} />
          ))}
        </SignalGrid>
      )}
    </div>
  );
}
