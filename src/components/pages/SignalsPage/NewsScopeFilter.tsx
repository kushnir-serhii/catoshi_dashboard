import type { NewsScopeFilter as NewsScope } from '@/lib/news/feed';

export const SCOPE_LABELS: Record<NewsScope, string> = {
  all: 'All',
  market: 'Market-wide',
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL',
};
const SCOPE_ORDER: NewsScope[] = ['all', 'market', 'BTC', 'ETH', 'SOL'];

export function NewsScopeFilter({
  filter,
  onFilterChange,
}: {
  filter: NewsScope;
  onFilterChange: (f: NewsScope) => void;
}) {
  return (
    <div className="ml-auto inline-flex flex-wrap gap-1">
      {SCOPE_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={filter === s}
          onClick={() => onFilterChange(s)}
          className="rounded-pill border-line text-text-2 aria-pressed:border-info/50 aria-pressed:bg-info/18 aria-pressed:text-info cursor-pointer border bg-transparent px-2 py-1 font-mono text-xs pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:justify-center"
        >
          {SCOPE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
