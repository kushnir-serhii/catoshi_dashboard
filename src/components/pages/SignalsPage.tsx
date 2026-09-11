'use client';

import { useState } from 'react';

import type { NewsScope, NewsSignalItem, SignalItem } from '@/data/types';
import { useSignals } from '@/hooks/useSignals';
import { formatSnapshotAge, isSnapshotStale } from '@/lib/freshness';
import { filterNewsByScope, newestNewsPublishedAt, type NewsScopeFilter } from '@/lib/news/feed';

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', ...style }}>{children}</div>;
}

function SignalCardSkeleton() {
  return (
    <div className="signal animate-pulse" style={{ padding: 'var(--sp-4)' }}>
      <div className="head" style={{ marginBottom: 'var(--sp-3)' }}>
        <span
          style={{
            display: 'inline-block',
            width: 60,
            height: 14,
            background: 'var(--surface-3)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 80,
            height: 12,
            background: 'var(--surface-3)',
            borderRadius: 'var(--radius-sm)',
            marginLeft: 'var(--sp-2)',
          }}
        />
      </div>
      <div
        style={{
          height: 15,
          background: 'var(--surface-3)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--sp-2)',
          width: '80%',
        }}
      />
      <div
        style={{
          height: 12,
          background: 'var(--surface-3)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--sp-1)',
          width: '95%',
        }}
      />
      <div
        style={{
          height: 12,
          background: 'var(--surface-3)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--sp-3)',
          width: '70%',
        }}
      />
      <div className="foot">
        <span
          style={{
            display: 'inline-block',
            width: 100,
            height: 11,
            background: 'var(--surface-3)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      </div>
    </div>
  );
}

/**
 * How long the condition behind a signal has held, derived from `since` vs now
 * (spec 014 slice 5) — "for 6h", "for 3d". Sub-hour conditions read "just now".
 */
function formatDuration(since: string): string {
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here. This
  // is a live age — `now - since` — where `since` (a data timestamp) is the
  // other operand, so it reports how long the condition has genuinely held. Not
  // the shipped defect (`decisions.md` §3, instance 2).
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 60 * 60 * 1000) return 'just now';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `for ${hours}h`;
  return `for ${Math.round(hours / 24)}d`;
}

function SignalCard({ s }: { s: SignalItem }) {
  const tagClass = s.tag === 'BULLISH' ? 'bullish' : s.tag === 'BEARISH' ? 'bearish' : 'neutral';
  const sinceTime = new Date(s.since).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`signal ${tagClass}`} style={{ padding: 'var(--sp-4)' }}>
      <div className="head">
        <span className="tag">{s.tag}</span>
        <span className="src">{s.source}</span>
      </div>
      <h4 style={{ fontSize: 'var(--fs-base)' }}>{s.title}</h4>
      {s.body && (
        <p className="small muted" style={{ margin: 'var(--sp-1) 0 var(--sp-2)', lineHeight: 'var(--lh-normal)' }}>
          {s.body}
        </p>
      )}
      {s.coins.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}>
          {s.coins.map((coin) => (
            <span
              key={coin}
              className="coin-chip"
              style={{
                background: 'var(--surface-3)',
                borderRadius: 'var(--radius-pill)',
                padding: 'var(--sp-0) var(--sp-2)',
                fontSize: 'var(--fs-xs)',
              }}
            >
              {coin}
            </span>
          ))}
        </div>
      )}
      <div className="foot" style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        <span className="small">
          {formatDuration(s.since) === 'just now'
            ? 'flagged just now'
            : `holding ${formatDuration(s.since)} · since ${sinceTime}`}
        </span>
        <span className="small muted">{new Date(s.publishedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function FeedNotice({
  tone,
  title,
  body,
}: {
  tone: 'error' | 'quiet';
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        padding: 'var(--sp-6) var(--sp-5)',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-2)',
        border:
          tone === 'error' ? '1px solid var(--color-error-border)' : '1px solid var(--surface-3)',
      }}
    >
      <h4
        style={{
          fontSize: 'var(--fs-base)',
          marginBottom: 'var(--sp-2)',
          color: tone === 'error' ? 'var(--red)' : 'var(--text)',
        }}
      >
        {title}
      </h4>
      <p className="small muted" style={{ margin: 0, lineHeight: 'var(--lh-normal)' }}>
        {body}
      </p>
    </div>
  );
}

/**
 * Muted note shown when the newest snapshot behind the feed is older than
 * `SNAPSHOT_STALE_MINUTES` (spec 017, Slice 2). Deliberately NOT an error state:
 * the data on the page may still be the best available, it is just old, and the
 * honest thing is to say how old and that collection may have stalled — the
 * regression guard against a page that silently presents stale data as current
 * (`decisions.md` §3, instance 2).
 */
function StaleCollectionNotice({ lastUpdated }: { lastUpdated: string }) {
  const age = formatSnapshotAge(lastUpdated);
  return (
    <div
      style={{
        marginBottom: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-4)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface-2)',
        border: '1px solid var(--surface-3)',
        color: 'var(--text-2)',
      }}
      className="small"
    >
      Data last updated {age ?? 'a while ago'} — collection may be stalled.
    </div>
  );
}

const SCOPE_LABELS: Record<NewsScopeFilter, string> = {
  all: 'All',
  market: 'Market-wide',
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL',
};
const SCOPE_ORDER: NewsScopeFilter[] = ['all', 'market', 'BTC', 'ETH', 'SOL'];

function scopeBadgeLabel(scope: NewsScope): string {
  return scope === 'market' ? 'market-wide' : scope;
}

/**
 * A classified news headline (spec 015). Deliberately distinct from a rule card:
 * a "NEWS" pill and a blue accent, the source name, a scope badge, a magnitude
 * indicator, an outbound link to the article, and the article's own age.
 */
function NewsCard({ n }: { n: NewsSignalItem }) {
  const tagClass = n.tag === 'BULLISH' ? 'bullish' : n.tag === 'BEARISH' ? 'bearish' : 'neutral';
  // Age is the ARTICLE's publication time — never classification or render time
  // (functional-spec 2.3, `decisions.md` §3 instance 2).
  const age = formatSnapshotAge(n.publishedAt) ?? 'recently';

  return (
    <div className={`signal news ${tagClass}`} style={{ padding: 'var(--sp-4)' }}>
      <div className="head">
        <span className="news-pill">NEWS</span>
        <span className="tag">{n.tag}</span>
        <span className="src">{n.source}</span>
      </div>
      <div className="news-meta">
        <span className="news-badge">{scopeBadgeLabel(n.scope)}</span>
        <span className={`news-badge mag-${n.magnitude}`}>{n.magnitude} impact</span>
      </div>
      <h4 style={{ fontSize: 'var(--fs-base)' }}>{n.title}</h4>
      {n.body && (
        <p className="small muted" style={{ margin: 'var(--sp-1) 0 var(--sp-2)', lineHeight: 'var(--lh-normal)' }}>
          {n.body}
        </p>
      )}
      <div className="foot" style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        <a className="news-link small" href={n.sourceUrl} target="_blank" rel="noopener noreferrer">
          Read on {n.source} ↗
        </a>
        <span className="small muted">{age}</span>
      </div>
    </div>
  );
}

/**
 * The news section: a scope filter (all / market-wide / one asset) applied
 * client-side over the single unfiltered fetch, the true age of the newest
 * news item, and an explicit empty state. Never hidden, never backfilled with
 * expired items — the API already excludes those.
 */
function NewsFeedSection({
  newsSignals,
  newsClassificationPaused,
}: {
  newsSignals: NewsSignalItem[];
  newsClassificationPaused: boolean;
}) {
  const [filter, setFilter] = useState<NewsScopeFilter>('all');
  const visible = filterNewsByScope(newsSignals, filter);
  const newestAll = newestNewsPublishedAt(newsSignals);
  const newestAge = newestAll ? formatSnapshotAge(newestAll) : null;

  return (
    <div style={{ marginTop: 'var(--sp-2)' }}>
      <div className="news-section-head">
        <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>News signals</h2>
        {newestAge && <span className="small muted">Newest news item: {newestAge}</span>}
        <div className="news-filter" style={{ marginLeft: 'auto' }}>
          {SCOPE_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        newsClassificationPaused ? (
          <FeedNotice
            tone="quiet"
            title="News classification paused"
            body="NEWS_CLASSIFY_ENABLED is off — no new headlines are being classified. Already-classified items above are unaffected; ingest and publishing continue."
          />
        ) : (
          <FeedNotice
            tone="quiet"
            title="No live news signals"
            body={
              filter === 'all'
                ? 'No classified headline is currently within its impact horizon.'
                : `No live news signals for ${SCOPE_LABELS[filter]}.`
            }
          />
        )
      ) : (
        <div className="pg-signals-2" style={{ gap: 'var(--sp-4)' }}>
          {visible.map((n) => (
            <NewsCard key={n.id} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}

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

  const showStaleCollection = !!lastUpdated && isSnapshotStale(lastUpdated);
  const hasSignals = (signals?.length ?? 0) > 0;
  const showError = !isLoading && (fetchError || (!hasSignals && !collectionHealthy));
  const showEmpty = !isLoading && !showError && !hasSignals;

  return (
    <div className="page-content">
      <h1 className="sr-only">Signals</h1>
      {isStale && (
        <div
          role="status"
          style={{
            marginBottom: 'var(--sp-3)',
            padding: 'var(--sp-2) var(--sp-4)',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-3)',
            border: '1px solid var(--color-notice-border)',
            color: 'var(--color-notice)',
          }}
          className="small"
        >
          Data may be outdated
        </div>
      )}

      {showStaleCollection && lastUpdated && <StaleCollectionNotice lastUpdated={lastUpdated} />}

      <div className="pg-signals-2" style={{ gap: 'var(--sp-4)' }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SignalCardSkeleton key={i} />)
        ) : showError ? (
          <FeedNotice
            tone="error"
            title="Signals feed is not updating"
            body="The market snapshot store could not be read, so no current signals are available. This does not mean the market is quiet — check back shortly."
          />
        ) : showEmpty ? (
          <FeedNotice
            tone="quiet"
            title="No signals right now"
            body="Collection is healthy and up to date — no tracked market condition has crossed a threshold worth flagging."
          />
        ) : (
          (signals ?? []).map((s) => <SignalCard key={s.id} s={s} />)
        )}
      </div>

      {!isLoading && !fetchError && newsSignals !== null && (
        <NewsFeedSection
          newsSignals={newsSignals}
          newsClassificationPaused={newsClassificationPaused}
        />
      )}

      {lastUpdated && (
        <Row style={{ gap: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-1) 0', flexWrap: 'wrap' }}>
          <span className="small muted">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
          {nextUpdate && (
            <span className="small muted">
              Next update: {new Date(nextUpdate).toLocaleString()}
            </span>
          )}
        </Row>
      )}
    </div>
  );
}
