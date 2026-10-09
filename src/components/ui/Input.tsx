import type { ComponentPropsWithRef } from 'react';

import { cn } from '@/utils/cn';

export type InputVariant = 'default' | 'raised' | 'edit';

const VARIANTS: Record<InputVariant, string> = {
  // today-level-input / coin search
  default: 'rounded-sm border border-line-2 bg-bg-2 px-3 py-2 text-base',
  // save-name prompt inside a popover
  raised: 'rounded border border-surface-3 bg-surface-3 px-3 py-2 text-base',
  // inline rename
  edit: 'rounded-sm border border-selected bg-surface-3 px-2 py-1 text-lg',
};

export interface InputProps extends ComponentPropsWithRef<'input'> {
  variant?: InputVariant;
}

export function Input({ variant = 'default', className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'text-text placeholder:text-text-3 focus-visible:outline-violet box-border w-full max-w-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
