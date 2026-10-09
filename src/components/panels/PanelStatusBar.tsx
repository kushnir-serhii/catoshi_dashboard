import type { ReactNode } from 'react';

/** Footer strip of a data panel: stale-data warning and/or refresh countdown. */
export function PanelStatusBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="border-line text-text-3 flex items-center gap-2 border-t px-4 py-2 text-xs tabular-nums"
    >
      {children}
    </div>
  );
}
