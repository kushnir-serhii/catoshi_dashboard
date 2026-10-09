import type { ReactNode } from 'react';

interface ChipGroupProps {
  label: string;
  children: ReactNode;
}

/** Wrapping row of pill chips. */
export function ChipGroup({ label, children }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="mt-3 flex flex-wrap gap-2">
      {children}
    </div>
  );
}
