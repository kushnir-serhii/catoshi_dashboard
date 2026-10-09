import { cn } from '@/utils/cn';

import type { SortableKey, SortState } from './utils';

interface SortableHeaderProps {
  label: string;
  sortKey: SortableKey;
  sort: SortState;
  onSort: (key: SortableKey) => void;
  align?: 'left' | 'right';
}

export function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
}: SortableHeaderProps) {
  const isActive = sort.key === sortKey;
  const indicator = isActive ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  return (
    <th
      aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(alignClass, isActive && 'border-b-text text-text')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        className={cn(
          'w-full cursor-pointer border-0 bg-transparent p-0 [letter-spacing:inherit] text-inherit [text-transform:inherit] select-none [font:inherit]',
          alignClass,
        )}
      >
        {label}
        <span aria-hidden="true">{indicator}</span>
      </button>
    </th>
  );
}
