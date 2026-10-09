import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export function CardHeader({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'mb-4 flex items-center justify-between max-md:flex-wrap max-md:gap-2',
        className,
      )}
      {...rest}
    />
  );
}
