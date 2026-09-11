'use client';

import { Surface } from '@heroui/react';
import Link from 'next/link';

import { PROJECTIONS_SIGNALS_COUNT } from '@/consts/projections';
import type { SignalItem } from '@/data/types';

interface SignalsPanelProps {
  /** Live rule-generated signals from `useSignals` — the same rows the
   * Signals page renders. `null` while the first fetch is in flight. */
  items: SignalItem[] | null;
  isLoading: boolean;
  fetchError: boolean;
}

function toneClass(tag: SignalItem['tag']): string {
  return tag === 'BULLISH' ? 'bullish' : tag === 'BEARISH' ? 'bearish' : 'neutral';
}

function Skeleton() {
  return (
    <div className="signal animate-pulse">
      <div className="head">
        <span style={{ width: 56, height: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-3)' }} />
        <span style={{ width: 72, height: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-3)' }} />
      </div>
      <div style={{ height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--surface-3)' }} />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="muted small"
      style={{
        gridColumn: '1 / -1',
        padding: 'var(--sp-5) var(--sp-4)',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
      }}
    >
      {children}
    </div>
  );
}

export function SignalsPanel({ items, isLoading, fetchError }: SignalsPanelProps) {
  const visible = (items ?? []).slice(0, PROJECTIONS_SIGNALS_COUNT);

  return (
    <Surface
      className="card area-signals padless"
      style={{ background: 'transparent', border: 0, padding: 0 }}
    >
      <div className="card-header" style={{ padding: '0 var(--sp-1)' }}>
        <div className="card-title">
          <span className="marker green"></span>Signals · last 24h
        </div>
        <Link href="/signals" className="btn-ghost">
          All signals →
        </Link>
      </div>
      <div className="signals">
        {isLoading ? (
          Array.from({ length: PROJECTIONS_SIGNALS_COUNT }).map((_, i) => <Skeleton key={i} />)
        ) : fetchError ? (
          <Notice>
            The signal store could not be read, so no current signals are shown. This does not mean
            the market is quiet.
          </Notice>
        ) : visible.length === 0 ? (
          <Notice>No tracked market condition has crossed a threshold worth flagging.</Notice>
        ) : (
          visible.map((s) => (
            <div className={`signal ${toneClass(s.tag)}`} key={s.id}>
              <div className="head">
                <span className="tag">{s.tag}</span>
                <span className="src">{s.source}</span>
              </div>
              <h4>{s.title}</h4>
              <div className="foot">
                <span>{s.coins.join(' · ') || 'Market-wide'}</span>
                <span>{new Date(s.publishedAt).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Surface>
  );
}
