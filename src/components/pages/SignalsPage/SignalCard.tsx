import { Badge, type BadgeTone, Muted } from '@/components/ui';
import type { SignalItem } from '@/data/types';
import { cn } from '@/utils/cn';

import { formatDuration, macroObservedLabel } from './utils';

function toneFor(tag: SignalItem['tag']): BadgeTone {
  if (tag === 'BULLISH') return 'bullish';
  if (tag === 'BEARISH') return 'bearish';
  return 'neutral';
}

export function SignalCard({ s }: { s: SignalItem }) {
  const tone = toneFor(s.tag);
  const sinceTime = new Date(s.since).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Macro signals (scope market) carry no coin: show a "Market" chip instead.
  const chips = s.coins.length > 0 ? s.coins : ['Market'];

  // Macro `since` is the FRED observation date, not how long a condition has held,
  // so macro cards get a "Source: FRED, as of <date>" line instead of a duration.
  const footText =
    formatDuration(s.since) === 'just now'
      ? 'flagged just now'
      : `holding ${formatDuration(s.since)} · since ${sinceTime}`;

  return (
    // `signal` stays as the hook for the Pulse jump highlight (`.signal.signal-highlight`).
    <div
      id={`signal-${s.id}`}
      className={cn(
        'signal border-line bg-surface relative flex cursor-default flex-col gap-2 overflow-hidden rounded-lg border p-4',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:content-[""]',
        tone === 'bullish' && 'after:shadow-[inset_0_1px_0_rgba(110,255,163,0.12)]',
        tone === 'bearish' && 'after:shadow-[inset_0_1px_0_rgba(255,110,110,0.12)]',
      )}
    >
      <div className="flex items-center justify-between">
        <Badge tone={tone}>{s.tag}</Badge>
        <span className="text-text-3 font-mono text-sm">{s.source}</span>
      </div>
      <h4 className="m-0 text-sm leading-(--lh-snug) font-medium">{s.title}</h4>
      {s.body && (
        <Muted as="p" className="mt-1 mb-2">
          {s.body}
        </Muted>
      )}
      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {chips.map((coin) => (
            <span key={coin} className="rounded-pill bg-surface-3 px-2 py-0.5 text-xs">
              {coin}
            </span>
          ))}
        </div>
      )}
      <div className="text-text-3 flex flex-wrap justify-between gap-2 font-mono text-sm">
        {s.kind !== 'macro' && <span className="text-sm leading-(--lh-normal)">{footText}</span>}
        <Muted>{new Date(s.publishedAt).toLocaleString()}</Muted>
      </div>
      {s.kind === 'macro' && (
        <Muted as="p" className="mt-1">
          Source: FRED, as of {macroObservedLabel(s.since)}
        </Muted>
      )}
    </div>
  );
}
