import { Skeleton } from '@/components/ui';

import type { WatchlistColumnKey } from './columns';
import { WatchlistCell } from './WatchlistCell';

const CELLS: { column: WatchlistColumnKey; tone: 'default' | 'subtle'; size: string }[] = [
  { column: 'price', tone: 'default', size: 'ml-auto h-6 w-24' },
  { column: 'change', tone: 'subtle', size: 'ml-auto h-4 w-16' },
  { column: 'trend', tone: 'default', size: 'h-6 w-22.5' },
  { column: 'projection', tone: 'subtle', size: 'ml-auto h-4 w-12' },
  { column: 'confidence', tone: 'default', size: 'h-4 w-20' },
];

/** Placeholder cells for the five data columns while the market response is pending. */
export function WatchlistRowSkeleton() {
  return (
    <>
      {CELLS.map(({ column, tone, size }) => (
        <WatchlistCell key={column} column={column}>
          <Skeleton tone={tone} className={size} />
        </WatchlistCell>
      ))}
    </>
  );
}
