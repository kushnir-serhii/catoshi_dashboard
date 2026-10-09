import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export type SkeletonTone = 'default' | 'subtle';

export interface SkeletonProps extends ComponentPropsWithoutRef<'div'> {
  /** `default` = surface-3, `subtle` = surface-2. */
  tone?: SkeletonTone;
}

/** Pulsing placeholder block. Size it with className, e.g. `h-4 w-16`. */
export function Skeleton({ tone = 'default', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-sm',
        tone === 'subtle' ? 'bg-surface-2' : 'bg-surface-3',
        className,
      )}
      {...rest}
    />
  );
}
