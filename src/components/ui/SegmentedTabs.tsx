import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface SegmentedTabOption<T extends string> {
  value: T;
  label?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string> {
  /** Plain strings (label = value) or `{ value, label }` objects. */
  options: ReadonlyArray<T | SegmentedTabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel?: string;
  className?: string;
}

/** Pill-style toggle group (`.chart-tabs`). Buttons expose `aria-pressed`. */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'border-line bg-bg-2 flex gap-1 rounded border p-1 max-md:max-w-full max-md:[scrollbar-width:none] max-md:overflow-x-auto max-md:[&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map((opt) => {
        const o: SegmentedTabOption<T> = typeof opt === 'string' ? { value: opt } : opt;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer rounded-sm border-0 px-3 py-1 text-xs transition-colors duration-(--dur-fast) disabled:cursor-not-allowed disabled:opacity-50 max-md:px-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center',
              active
                ? 'bg-surface-2 text-text'
                : 'text-text-3 hover:bg-surface-2 hover:text-text-2 bg-transparent',
            )}
          >
            {o.label ?? o.value}
          </button>
        );
      })}
    </div>
  );
}
