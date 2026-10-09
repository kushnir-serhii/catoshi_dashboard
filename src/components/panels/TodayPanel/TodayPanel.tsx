'use client';

import { TODAY_GATE_VERDICT } from '@/consts/today';
import type { CoinListItem } from '@/data/types';
import { resolveTodayGate } from '@/lib/todayGate';

import { TodayCard } from './TodayCard';

interface TodayPanelProps {
  coin: CoinListItem;
}

const PREVIEW_ENABLED = process.env.NEXT_PUBLIC_TODAY_GATE_PREVIEW === 'true';

export function TodayPanel({ coin }: TodayPanelProps) {
  const gate = resolveTodayGate({
    verdict: TODAY_GATE_VERDICT,
    preview: PREVIEW_ENABLED,
    isProduction: process.env.NODE_ENV === 'production',
  });
  if (gate.mode === 'hidden') return null;

  // `key` resets the horizon and level state whenever the coin changes.
  return (
    <TodayCard
      key={coin.id}
      coin={coin}
      showLevel={gate.mode === 'full'}
      isPreview={gate.isPreview}
    />
  );
}
