import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

/** Inset surface that holds an admin card's content (tables, status rows, skeletons). */
export function AdminBox({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('border-surface-3 bg-surface-2 rounded-lg border p-6', className)}
      {...rest}
    />
  );
}
