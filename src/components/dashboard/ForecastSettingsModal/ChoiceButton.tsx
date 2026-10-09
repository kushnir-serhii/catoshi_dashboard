import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

interface ChoiceButtonProps extends ComponentPropsWithoutRef<'button'> {
  selected: boolean;
}

/** Selectable option button (provider / model). */
export function ChoiceButton({ selected, className, ...rest }: ChoiceButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer border-[1.5px] px-4 text-sm transition-colors duration-(--dur-fast)',
        selected
          ? 'border-selected bg-selected-softer text-selected font-semibold'
          : 'border-surface-3 bg-surface-2 text-text-2 font-normal',
        className,
      )}
      {...rest}
    />
  );
}
