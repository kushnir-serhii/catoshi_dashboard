import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** Remove the default 16px padding (`.card.padless`). */
  padless?: boolean;
  /** Violet bloom around the card (`.card.glow-violet`). */
  glow?: boolean;
}

export function Card({ padless = false, glow = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'border-line bg-surface relative rounded-lg border bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent)]',
        padless ? 'p-0' : 'p-4',
        glow &&
          'shadow-[inset_0_0_0_1px_rgba(176,139,255,0.06),0_0_var(--glow-xl)_oklch(0.55_0.22_295/calc(0.1*var(--glow)))]',
        className,
      )}
      {...rest}
    />
  );
}
