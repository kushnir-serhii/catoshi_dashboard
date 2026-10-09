import type { ReactNode } from 'react';

/** Two-column card grid (single column on tablet/mobile) shared by market and news feeds. */
export function SignalGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">{children}</div>;
}
