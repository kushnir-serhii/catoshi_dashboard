import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

import { CELL, CELL_TONES, type CellTone } from './cellStyles';

export function AdminTd({
  tone = 'default',
  className,
  ...rest
}: ComponentPropsWithoutRef<'td'> & { tone?: CellTone }) {
  return <td className={cn(CELL, CELL_TONES[tone], className)} {...rest} />;
}
