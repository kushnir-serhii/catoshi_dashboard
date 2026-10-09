import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export type MarkerColor = 'violet' | 'green';

const COLORS: Record<MarkerColor, string> = {
  violet: 'bg-violet shadow-[0_0_var(--glow-sm)_var(--color-violet)]',
  green: 'bg-green shadow-[0_0_var(--glow-sm)_var(--color-green)]',
};

export interface MarkerProps extends ComponentPropsWithoutRef<'span'> {
  color?: MarkerColor;
}

/** Small glowing dot that prefixes a card title. */
export function Marker({ color = 'violet', className, ...rest }: MarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('rounded-pill inline-block size-1.5 shrink-0', COLORS[color], className)}
      {...rest}
    />
  );
}
