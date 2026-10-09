import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

/** Inset surface used for each model group, the skeleton and the exclusions summary. */
export function CardBox({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('border-surface-3 bg-surface-2 rounded-lg border p-6', className)}
      {...rest}
    />
  );
}
