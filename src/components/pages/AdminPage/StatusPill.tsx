import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

/** Small mono pill on surface-3; set the text colour via className. */
export function StatusPill({ className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn(
        'rounded-pill bg-surface-3 px-3 py-0.5 font-mono text-sm leading-(--lh-normal)',
        className,
      )}
      {...rest}
    />
  );
}
