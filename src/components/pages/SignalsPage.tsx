'use client';

import { useSignals } from '@/hooks/useSignals';
import type { SignalItem } from '@/data/types';

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>{children}</div>;
}

function SignalCardSkeleton() {
  return (
    <div className="signal animate-pulse" style={{ padding: 18 }}>
      <div className="head" style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-block', width: 60, height: 14, background: 'var(--surface-3)', borderRadius: 4 }} />
        <span style={{ display: 'inline-block', width: 80, height: 12, background: 'var(--surface-3)', borderRadius: 4, marginLeft: 8 }} />
      </div>
      <div style={{ height: 15, background: 'var(--surface-3)', borderRadius: 4, marginBottom: 8, width: '80%' }} />
      <div style={{ height: 12, background: 'var(--surface-3)', borderRadius: 4, marginBottom: 5, width: '95%' }} />
      <div style={{ height: 12, background: 'var(--surface-3)', borderRadius: 4, marginBottom: 12, width: '70%' }} />
      <div className="foot">
        <span style={{ display: 'inline-block', width: 100, height: 11, background: 'var(--surface-3)', borderRadius: 4 }} />
      </div>
    </div>
  );
}

/**
 * How long the condition behind a signal has held, derived from `since` vs now
 * (spec 014 slice 5) — "for 6h", "for 3d". Sub-hour conditions read "just now".
 */
function formatDuration(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 60 * 60 * 1000) return 'just now';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `for ${hours}h`;
  return `for ${Math.round(hours / 24)}d`;
}

function SignalCard({ s }: { s: SignalItem }) {
  const tagClass = s.tag === 'BULLISH' ? 'bullish' : s.tag === 'BEARISH' ? 'bearish' : 'neutral';
  const sinceTime = new Date(s.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`signal ${tagClass}`} style={{ padding: 18 }}>
      <div className="head">
        <span className="tag">{s.tag}</span>
        <span className="src">{s.source}</span>
      </div>
      <h4 style={{ fontSize: 15 }}>{s.title}</h4>
      {s.body && <p className="small muted" style={{ margin: '4px 0 8px', lineHeight: 1.6 }}>{s.body}</p>}
      {s.coins.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {s.coins.map((coin) => (
            <span
              key={coin}
              className="coin-chip"
              style={{
                background: 'var(--surface-3)',
                borderRadius: 999,
                padding: '2px 7px',
                fontSize: 11,
              }}
            >
              {coin}
            </span>
          ))}
        </div>
      )}
      <div className="foot" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="small">
          {formatDuration(s.since) === 'just now' ? 'flagged just now' : `holding ${formatDuration(s.since)} · since ${sinceTime}`}
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
        padding: '32px 20px',
        textAlign: 'center',
        borderRadius: 12,
        background: 'var(--surface-2)',
        border:
          tone === 'error'
            ? '1px solid oklch(0.6 0.18 20 / 0.45)'
            : '1px solid var(--surface-3)',
      }}
    >
      <h4
        style={{
          fontSize: 15,
          marginBottom: 6,
          color: tone === 'error' ? 'var(--red)' : 'var(--text)',
        }}
      >
        {title}
      </h4>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
        {body}
      </p>
    </div>
  );
}

export function SignalsPage() {
  const { signals, lastUpdated, nextUpdate, isLoading, isStale, fetchError, collectionHealthy } =
    useSignals();

  const hasSignals = (signals?.length ?? 0) > 0;
  const showError = !isLoading && (fetchError || (!hasSignals && !collectionHealthy));
  const showEmpty = !isLoading && !showError && !hasSignals;

  return (
    <div className="page-content">
      {isStale && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid oklch(0.65 0.15 55 / 0.4)', color: 'oklch(0.75 0.12 55)' }} className="small">
          Data may be outdated
        </div>
      )}

      <div className="pg-signals-2" style={{ gap: 14 }}>
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

      {lastUpdated && (
        <Row style={{ gap: 16, padding: '12px 4px 0', flexWrap: 'wrap' }}>
          <span className="small muted">Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          {nextUpdate && (
            <span className="small muted">Next update: {new Date(nextUpdate).toLocaleString()}</span>
          )}
        </Row>
      )}
    </div>
  );
}
