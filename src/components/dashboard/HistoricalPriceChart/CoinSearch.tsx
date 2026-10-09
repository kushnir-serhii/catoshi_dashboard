'use client';

import { useMemo, useState } from 'react';

import { Input } from '@/components/ui';
import { useCoinSearch } from '@/hooks/useCoinSearch';

interface CoinSearchProps {
  /** Currently selected coin id, shown as the input placeholder. */
  coinId: string;
  onSelect: (coinId: string) => void;
}

export function CoinSearch({ coinId, onSelect }: CoinSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const { search } = useCoinSearch();
  const searchResults = useMemo(() => search(searchQuery), [search, searchQuery]);

  return (
    <div className="relative">
      <Input
        value={searchQuery}
        placeholder={coinId}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        className="border-line w-30 py-1"
      />
      {showDropdown && searchResults.length > 0 && (
        <div className="border-line-2 bg-surface-2 shadow-raised absolute top-[calc(100%+4px)] left-0 z-(--z-dropdown) max-h-50 min-w-45 overflow-y-auto rounded border">
          {searchResults.map((coin) => (
            <button
              key={coin.id}
              onMouseDown={() => {
                onSelect(coin.id);
                setSearchQuery('');
                setShowDropdown(false);
              }}
              className="text-text hover:bg-surface-3 block w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-sm"
            >
              <span className="text-text-2 mr-2 text-xs uppercase">{coin.symbol}</span>
              {coin.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
