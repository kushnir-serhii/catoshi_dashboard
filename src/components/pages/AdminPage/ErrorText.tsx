import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

/** Inline red error / unavailable message. */
export function ErrorText({ className, ...rest }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('text-red text-sm leading-(--lh-normal)', className)} {...rest} />;
}
