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
    body = <p className="text-sm leading-(--lh-normal)">Market Pulse unavailable.</p>;
  } else if (!data) {
    body = isLoading ? (
      <p className="text-text-3 text-sm leading-(--lh-normal)">Loading Market Pulse…</p>
    ) : (
      <p className="text-sm leading-(--lh-normal)">Market Pulse unavailable.</p>
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
        <p className="text-text-3 text-sm leading-(--lh-normal)">
          Stale: last computed {formatLocalTimeWithOffset(data.computedAt)}
        </p>
      </>
    );
  } else if (data.status === 'insufficient') {
    body = <p className="text-sm leading-(--lh-normal)">Not enough live signals to summarise.</p>;
  } else {
    const nextWhen = data.nextEvent ? formatEventWhen(data.nextEvent.ts, new Date()) : '';
    body = (
      <>
        <PulseBar value={data.value} prev24h={data.prev24h} conflict={data.conflict} />
        <PulseDriverChips drivers={data.drivers} onSelect={onDriverSelect} />
        <p className="m-0 text-sm leading-(--lh-normal)">{data.summary}</p>
        {data.missing.length > 0 ? (
          <p className="text-text-3 m-0 text-sm leading-(--lh-normal)">
            Without: {data.missing.join(', ')}
          </p>
        ) : null}
        {data.nextEvent ? (
          <p className="text-text-3 m-0 text-sm leading-(--lh-normal)">
            Next: {data.nextEvent.title} · {nextWhen}
          </p>
        ) : null}
        <p className="text-text-3 m-0 text-sm leading-(--lh-normal)">
          Updated {formatLocalTimeWithOffset(data.computedAt)} · from {data.inputCount} live signals
        </p>
      </>
    );
  }

  return (
    <section aria-label="Market Pulse" className="grid gap-3">
      <PulseScopeSwitch value={scope} onChange={setScope} />
      <div aria-live="polite" className="grid gap-3">
        {body}
      </div>
      <p className="text-text-3 m-0 text-sm leading-(--lh-normal)">{DISCLAIMER}</p>
    </section>
  );
}
