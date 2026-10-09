import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

interface ChipProps extends ComponentPropsWithoutRef<'button'> {
  active?: boolean;
}

/** Pill-shaped option button. Pass `aria-pressed` for toggles. */
export function Chip({ active = false, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      className={cn(
        'border-line rounded-pill min-h-8 cursor-pointer border px-3 py-1 text-sm [font:inherit] disabled:cursor-not-allowed disabled:opacity-45',
        active ? 'text-text bg-violet-soft border-violet' : 'text-text-2 bg-bg-2',
        className,
      )}
      {...rest}
    />
  );
}
