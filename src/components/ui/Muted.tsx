import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export type MutedSize = 'sm' | 'xs';
export type MutedElement = 'span' | 'p' | 'div' | 'label';

export interface MutedProps extends ComponentPropsWithoutRef<'span'> {
  as?: MutedElement;
  /** `sm` = 14px with body line-height (`.muted.small`), `xs` = 12px. */
  size?: MutedSize;
  htmlFor?: string;
}

export function Muted({ as: Tag = 'span', size = 'sm', className, ...rest }: MutedProps) {
  return (
    <Tag
      className={cn(
        'text-text-3',
        size === 'sm' ? 'text-sm leading-(--lh-normal)' : 'text-xs',
        className,
      )}
      {...rest}
    />
  );
}
