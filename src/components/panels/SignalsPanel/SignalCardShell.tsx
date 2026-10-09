import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

interface SignalCardShellProps {
  /** Adds a faint directional highlight along the top edge. */
  tone?: 'bullish' | 'bearish' | 'neutral';
  children: ReactNode;
}

/** Bordered card frame shared by a signal and its loading placeholder. */
export function SignalCardShell({ tone = 'neutral', children }: SignalCardShellProps) {
  return (
    <div
      className={cn(
        'border-line bg-surface relative flex cursor-default flex-col gap-2 overflow-hidden rounded-lg border p-4',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:content-[""]',
        tone === 'bullish' && 'after:shadow-[inset_0_1px_0_rgba(110,255,163,0.12)]',
        tone === 'bearish' && 'after:shadow-[inset_0_1px_0_rgba(255,110,110,0.12)]',
      )}
    >
      {children}
    </div>
  );
}
