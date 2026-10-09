'use client';

import Link from 'next/link';

import { buttonVariants, CardHeader, CardTitle, Notice } from '@/components/ui';
import { PROJECTIONS_SIGNALS_COUNT } from '@/consts/projections';
import type { SignalItem } from '@/data/types';

import { SignalCard } from './SignalCard';
import { SignalCardSkeleton } from './SignalCardSkeleton';

interface SignalsPanelProps {
  /** Live rule-generated signals from `useSignals` — the same rows the
   * Signals page renders. `null` while the first fetch is in flight. */
  items: SignalItem[] | null;
  isLoading: boolean;
  fetchError: boolean;
}

export function SignalsPanel({ items, isLoading, fetchError }: SignalsPanelProps) {
  const visible = (items ?? []).slice(0, PROJECTIONS_SIGNALS_COUNT);
  const noticeText = fetchError
    ? 'The signal store could not be read, so no current signals are shown. This does not mean the market is quiet.'
    : visible.length === 0
      ? 'No tracked market condition has crossed a threshold worth flagging.'
      : null;

  return (
    <div className="relative [grid-area:signals]">
      <CardHeader className="px-1 max-sm:mb-3">
        <CardTitle marker="green">Signals · last 24h</CardTitle>
        <Link href="/signals" className={buttonVariants()}>
          All signals →
        </Link>
      </CardHeader>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {isLoading ? (
          Array.from({ length: PROJECTIONS_SIGNALS_COUNT }).map((_, i) => (
            <SignalCardSkeleton key={i} />
          ))
        ) : noticeText !== null ? (
          <Notice tone="plain" padding="sm" className="col-span-full">
            {noticeText}
          </Notice>
        ) : (
          visible.map((s) => <SignalCard key={s.id} signal={s} />)
        )}
      </div>
    </div>
  );
}
