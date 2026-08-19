'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import SearchIcon from '@/assets/icons/header/search-md.svg';
import type { CoinListItem } from '@/data/types';
import { useCoinSearch } from '@/hooks/useCoinSearch';

interface CoinSelectProps {
  /** Currently selected coin. */
  value: CoinListItem;
  onChange: (coin: CoinListItem) => void;
  /** Rendered inside the dropdown's search field. */
  placeholder?: string;
}

/**
 * Searchable coin picker over the full CoinGecko coin list.
 *
 * Closed, it reads as a compact trigger showing the selected symbol; open, it
 * borrows the topbar's `.search` field treatment for the query input and lists
 * matches below it. Empty/short queries fall back to the popular-coin shortlist
 * that `useCoinSearch` returns.
 */
export function CoinSelect({ value, onChange, placeholder = 'Search coin…' }: CoinSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { search, isLoading } = useCoinSearch();
  const results = useMemo(() => search(query), [search, query]);

  // Reopening should always start from a clean query and the first result.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  function select(coin: CoinListItem) {
    onChange(coin);
    setIsOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const coin = results[activeIndex];
      if (coin) select(coin);
    }
  }

  return (
    <div className="coin-select" ref={rootRef}>
      <button
        type="button"
        className="coin-select-trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="sym">{value.symbol.toUpperCase()}</span>
        <span className="name">{value.name}</span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="coin-select-menu">
          <div className="search">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label="Search coins"
            />
            <SearchIcon width={16} height={16} />
          </div>
          <ul className="coin-select-list" role="listbox">
            {isLoading && results.length === 0 && <li className="empty">Loading coins…</li>}
            {!isLoading && results.length === 0 && <li className="empty">No matches</li>}
            {results.map((coin, i) => (
              <li key={coin.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={coin.id === value.id}
                  className={i === activeIndex ? 'active' : ''}
                  onPointerEnter={() => setActiveIndex(i)}
                  onClick={() => select(coin)}
                >
                  <span className="sym">{coin.symbol.toUpperCase()}</span>
                  <span className="name">{coin.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
