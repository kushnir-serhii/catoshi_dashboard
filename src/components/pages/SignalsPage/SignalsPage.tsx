'use client';

import { useState } from 'react';

import { MarketPulse, ShowMoreToggle } from '@/components/signals';
import { Muted, Notice } from '@/components/ui';
import { SIGNALS_EXPANDED_COUNT } from '@/consts/signals';
import { useCardHighlight } from '@/hooks/useCardHighlight';
import { useSignals } from '@/hooks/useSignals';
import { isSnapshotStale, marketEmptyStateCopy } from '@/lib/freshness';
import { filterNewsByScope, type NewsScopeFilter } from '@/lib/news/feed';

import { NewsFeedSection } from './NewsFeedSection';
import { SignalCard } from './SignalCard';
import { SignalCardSkeleton } from './SignalCardSkeleton';
import { SignalGrid } from './SignalGrid';
import { StaleCollectionNotice } from './StaleCollectionNotice';

export function SignalsPage() {
  const {
    signals,
    newsSignals,
    lastUpdated,
    nextUpdate,
    isLoading,
    isStale,
    fetchError,
    collectionHealthy,
    newsClassificationPaused,
  } = useSignals();

  // Lifted so a later slice can expand the tail programmatically.
  const [expanded, setExpanded] = useState(false);
  const [newsFilter, setNewsFilter] = useState<NewsScopeFilter>('all');
  const focusCard = useCardHighlight();
  const allSignals = signals ?? [];
  const visibleSignals = expanded ? allSignals : allSignals.slice(0, SIGNALS_EXPANDED_COUNT);
  const hiddenCount = Math.max(0, allSignals.length - SIGNALS_EXPANDED_COUNT);

  // Pulse driver chip: reveal the card if the collapse or the news scope filter
  // hides it, then scroll + ring it (the hook scrolls after the commit).
  function handleDriverSelect(signalId: string) {
    const marketIdx = allSignals.findIndex((s) => s.id === signalId);
    if (marketIdx >= SIGNALS_EXPANDED_COUNT) setExpanded(true);
    if (
      newsSignals &&
      newsSignals.some((n) => n.id === signalId) &&
      !filterNewsByScope(newsSignals, newsFilter).some((n) => n.id === signalId)
    ) {
      setNewsFilter('all');
    }
    focusCard(signalId);
  }

  const showStaleCollection = !!lastUpdated && isSnapshotStale(lastUpdated);
  const hasSignals = (signals?.length ?? 0) > 0;
  const showError = !isLoading && (fetchError || (!hasSignals && !collectionHealthy));
  const showEmpty = !isLoading && !showError && !hasSignals;
  const marketEmptyCopy = marketEmptyStateCopy(showStaleCollection, lastUpdated);

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
      <h1 className="sr-only">Signals</h1>
      {isStale && (
        <Notice
          tone="warning"
          layout="inline"
          role="status"
          className="bg-surface-3 mb-3 rounded px-4"
        >
          Data may be outdated
        </Notice>
      )}

      {showStaleCollection && lastUpdated && <StaleCollectionNotice lastUpdated={lastUpdated} />}

      <MarketPulse onDriverSelect={handleDriverSelect} />

      <SignalGrid>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SignalCardSkeleton key={i} />)
        ) : showError ? (
          <Notice
            tone="error"
            padding="md"
            className="col-span-full"
            title="Signals feed is not updating"
            body="The market snapshot store could not be read, so no current signals are available. This does not mean the market is quiet — check back shortly."
          />
        ) : showEmpty ? (
          <Notice
            padding="md"
            className="col-span-full"
            title={marketEmptyCopy.title}
            body={marketEmptyCopy.body}
          />
        ) : (
          <>
            {visibleSignals.map((s) => (
              <SignalCard key={s.id} s={s} />
            ))}
            {hiddenCount > 0 && (
              <ShowMoreToggle
                expanded={expanded}
                hiddenCount={hiddenCount}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
          </>
        )}
      </SignalGrid>

      {!isLoading && !fetchError && newsSignals !== null && (
        <NewsFeedSection
          newsSignals={newsSignals}
          newsClassificationPaused={newsClassificationPaused}
          showStaleCollection={showStaleCollection}
          filter={newsFilter}
          onFilterChange={setNewsFilter}
        />
      )}

      {lastUpdated && (
        <div className="flex flex-wrap items-center gap-4 px-1 pt-3">
          <Muted>Last updated: {new Date(lastUpdated).toLocaleString()}</Muted>
          {nextUpdate && <Muted>Next update: {new Date(nextUpdate).toLocaleString()}</Muted>}
        </div>
      )}
    </div>
  );
}
