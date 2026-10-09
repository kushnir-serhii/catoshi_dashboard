import { Muted } from '@/components/ui';
import type { TodayResponse } from '@/data/types';

export function UnavailableMessage({
  data,
}: {
  data: Extract<TodayResponse, { status: 'unavailable' }>;
}) {
  // No number is ever rendered here (functional §2.5); `lastBarTs` is a time only.
  if (data.reason === 'insufficient') {
    return <Muted as="p">Not enough recent data.</Muted>;
  }
  if (data.reason === 'untracked') {
    return <Muted as="p">Today range is available for BTC, ETH and SOL.</Muted>;
  }
  const last = data.lastBarTs ? new Date(data.lastBarTs) : null;
  const lastText =
    last && !Number.isNaN(last.getTime())
      ? last.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
        })
      : null;
  return (
    <div>
      <Muted as="p">Intraday data unavailable right now.</Muted>
      {data.reason === 'stale' && lastText && <Muted as="p">last data: {lastText}</Muted>}
    </div>
  );
}
