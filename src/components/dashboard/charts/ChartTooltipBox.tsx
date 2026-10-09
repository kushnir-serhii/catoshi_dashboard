import type { ReactNode } from 'react';

/** Shared floating box used by the chart tooltips. */
export function ChartTooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="border-line-2 bg-surface-2 text-text pointer-events-none rounded border px-3 py-2 font-mono text-xs leading-[1.9]">
      {children}
    </div>
  );
}
