import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

import { CELL, CELL_TONES } from './cellStyles';

export function AdminTh({ className, ...rest }: ComponentPropsWithoutRef<'th'>) {
  return <th className={cn(CELL, CELL_TONES.muted, className)} {...rest} />;
}
