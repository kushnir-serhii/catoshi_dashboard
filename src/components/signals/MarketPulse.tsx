'use client';

import { useState } from 'react';

import type { PulseScope } from '@/data/types';
import { useMarketPulse } from '@/hooks/useMarketPulse';
import { formatEventWhen, formatLocalTimeWithOffset } from '@/lib/pulse/format';

import { PulseBar } from './PulseBar';
import { PulseDriverChips } from './PulseDriverChips';
import { PulseScopeSwitch } from './PulseScopeSwitch';

interface MarketPulseProps {
  onDriverSelect: (signalId: string) => void;
}

const DISCLAIMER =
  'Balance of live signals. Weights are conventions, not calibrated (yet). Not a forecast. Not financial advice.';

/** Market Pulse card: scope switch, bar, drivers, summary and every failure state (spec 027 §2.1–2.2). */
export function MarketPulse({ onDriverSelect }: MarketPulseProps) {
  const [scope, setScope] = useState<PulseScope>('market');
  const { data, lastOk, isLoading, error } = useMarketPulse(scope);

  let body: React.ReactNode;
  if (error || data?.status === 'unavailable') {
    body = <p className="small">Market Pulse unavailable.</p>;
  } else if (!data) {
    body = isLoading ? (
      <p className="small muted">Loading Market Pulse…</p>
    ) : (
      <p className="small">Market Pulse unavailable.</p>
    );
  } else if (data.status === 'stale') {
    body = (
      <>
        {lastOk ? (
          <PulseBar
            value={lastOk.value}
            prev24h={lastOk.prev24h}
            conflict={lastOk.conflict}
            greyed
          />
        ) : null}
        <p className="small muted">
          Stale: last computed {formatLocalTimeWithOffset(data.computedAt)}
        </p>
      </>
    );
  } else if (data.status === 'insufficient') {
    body = <p className="small">Not enough live signals to summarise.</p>;
  } else {
    const nextWhen = data.nextEvent ? formatEventWhen(data.nextEvent.ts, new Date()) : '';
    body = (
      <>
        <PulseBar value={data.value} prev24h={data.prev24h} conflict={data.conflict} />
        <PulseDriverChips drivers={data.drivers} onSelect={onDriverSelect} />
        <p className="small" style={{ margin: 0 }}>
          {data.summary}
        </p>
        {data.missing.length > 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Without: {data.missing.join(', ')}
          </p>
        ) : null}
        {data.nextEvent ? (
          <p className="small muted" style={{ margin: 0 }}>
            Next: {data.nextEvent.title} · {nextWhen}
          </p>
        ) : null}
        <p className="small muted" style={{ margin: 0 }}>
          Updated {formatLocalTimeWithOffset(data.computedAt)} · from {data.inputCount} live signals
        </p>
      </>
    );
  }

  return (
    <section aria-label="Market Pulse" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <PulseScopeSwitch value={scope} onChange={setScope} />
      <div aria-live="polite" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {body}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {DISCLAIMER}
      </p>
    </section>
  );
}
