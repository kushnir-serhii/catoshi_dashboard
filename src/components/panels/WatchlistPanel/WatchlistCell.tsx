import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

import type { WatchlistColumnKey } from './columns';

/** Phone layout: each row is a two-column card; projection and confidence get a caption. */
const LABEL =
  'max-sm:border-t max-sm:border-line max-sm:pt-2 max-sm:before:mb-1 max-sm:before:block max-sm:before:text-xs max-sm:before:font-medium max-sm:before:tracking-(--ls-label) max-sm:before:text-text-3 max-sm:before:uppercase max-sm:before:content-[attr(data-label)]';

const COLUMN_CLASS: Record<WatchlistColumnKey, string> = {
  asset: '',
  price: 'text-right max-sm:text-right max-sm:text-base max-sm:font-semibold',
  change: 'text-right max-sm:col-start-1 max-sm:text-left',
  trend: 'max-sm:col-start-2 max-sm:justify-self-end',
  projection: `text-right max-sm:text-left ${LABEL}`,
  confidence: `max-sm:text-right ${LABEL}`,
};

const MOBILE_LABEL: Partial<Record<WatchlistColumnKey, string>> = {
  projection: 'Projection',
  confidence: 'Confidence',
};

interface WatchlistCellProps {
  column: WatchlistColumnKey;
  className?: string;
  children: ReactNode;
}

export function WatchlistCell({ column, className, children }: WatchlistCellProps) {
  return (
    <td
      data-label={MOBILE_LABEL[column]}
      className={cn(
        'border-line border-b p-3 align-middle text-sm tabular-nums max-sm:block max-sm:border-0 max-sm:p-0',
        COLUMN_CLASS[column],
        className,
      )}
    >
      {children}
    </td>
  );
}
