import { Badge } from '@/components/ui';
import type { SignalItem } from '@/data/types';

import { SignalCardShell } from './SignalCardShell';

const TONE_BY_TAG: Record<SignalItem['tag'], 'bullish' | 'bearish' | 'neutral'> = {
  BULLISH: 'bullish',
  BEARISH: 'bearish',
  NEUTRAL: 'neutral',
};

export function SignalCard({ signal }: { signal: SignalItem }) {
  const tone = TONE_BY_TAG[signal.tag] ?? 'neutral';

  return (
    <SignalCardShell tone={tone}>
      <div className="flex items-center justify-between">
        <Badge tone={tone}>{signal.tag}</Badge>
        <span className="text-text-3 font-mono text-sm">{signal.source}</span>
      </div>
      <h4 className="m-0 text-sm leading-(--lh-snug) font-medium">{signal.title}</h4>
      <div className="text-text-3 flex justify-between font-mono text-sm">
        <span>{signal.coins.join(' · ') || 'Market-wide'}</span>
        <span>{new Date(signal.publishedAt).toLocaleString()}</span>
      </div>
    </SignalCardShell>
  );
}
