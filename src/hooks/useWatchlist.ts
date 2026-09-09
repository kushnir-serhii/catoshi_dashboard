'use client';

import { useCallback, useState } from 'react';

import {
  WATCHLIST_MAX_COINS,
  WATCHLIST_STORAGE_KEY,
  WATCHLIST_STORAGE_VERSION,
} from '@/consts/prices';
import { DEFAULT_FORECAST_TARGETS } from '@/consts/projections';

/** Minimal coin identity persisted per watchlist entry — enough to render a
 * row's label before the first market response arrives (spec 021 §2.3). */
export interface WatchlistCoin {
  id: string;
  symbol: string;
  name: string;
}

interface StoredWatchlist {
  v: number;
  coins: WatchlistCoin[];
}

/** The starting list — reuses `DEFAULT_FORECAST_TARGETS` so the strip's seed
 * coins and the forecast targets can never drift apart. A fresh array each
 * call so no caller can mutate the shared constant. */
export function defaultWatchlist(): WatchlistCoin[] {
  return DEFAULT_FORECAST_TARGETS.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name }));
}

function isWatchlistCoin(value: unknown): value is WatchlistCoin {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WatchlistCoin).id === 'string' &&
    typeof (value as WatchlistCoin).symbol === 'string' &&
    typeof (value as WatchlistCoin).name === 'string'
  );
}

/**
 * Pure reducer: parse a raw localStorage string into the coin list. A missing
 * value, malformed JSON, a version other than `WATCHLIST_STORAGE_VERSION`, or
 * a bad payload shape all fall back to the default list — matching the
 * forecast-settings / chart-prefs convention.
 */
export function parseStored(raw: string | null): WatchlistCoin[] {
  if (!raw) return defaultWatchlist();
  try {
    const parsed = JSON.parse(raw) as Partial<StoredWatchlist>;
    if (parsed.v !== WATCHLIST_STORAGE_VERSION || !Array.isArray(parsed.coins)) {
      return defaultWatchlist();
    }
    const coins = parsed.coins.filter(isWatchlistCoin).slice(0, WATCHLIST_MAX_COINS);
    return coins.length > 0 ? coins : defaultWatchlist();
  } catch {
    return defaultWatchlist();
  }
}

/** Pure reducer: append a coin. No-op on a duplicate id or when the list is
 * already at `WATCHLIST_MAX_COINS`. */
export function addCoin(coins: readonly WatchlistCoin[], coin: WatchlistCoin): WatchlistCoin[] {
  if (coins.length >= WATCHLIST_MAX_COINS) return [...coins];
  if (coins.some((c) => c.id === coin.id)) return [...coins];
  return [...coins, { id: coin.id, symbol: coin.symbol, name: coin.name }];
}

/** Pure reducer: drop the coin with `id`. */
export function removeCoin(coins: readonly WatchlistCoin[], id: string): WatchlistCoin[] {
  return coins.filter((c) => c.id !== id);
}

function readFromStorage(): WatchlistCoin[] {
  if (typeof window === 'undefined') return defaultWatchlist();
  try {
    return parseStored(localStorage.getItem(WATCHLIST_STORAGE_KEY));
  } catch {
    return defaultWatchlist();
  }
}

function writeToStorage(coins: WatchlistCoin[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredWatchlist = { v: WATCHLIST_STORAGE_VERSION, coins };
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: private browsing, blocked site data, quota exceeded.
  }
}

export interface UseWatchlist {
  coins: WatchlistCoin[];
  ids: string[];
  add: (coin: WatchlistCoin) => void;
  remove: (id: string) => void;
  isFull: boolean;
}

export function useWatchlist(): UseWatchlist {
  const [coins, setCoins] = useState<WatchlistCoin[]>(() => readFromStorage());

  const add = useCallback((coin: WatchlistCoin): void => {
    setCoins((prev) => {
      const next = addCoin(prev, coin);
      if (next.length === prev.length) return prev;
      writeToStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string): void => {
    setCoins((prev) => {
      const next = removeCoin(prev, id);
      if (next.length === prev.length) return prev;
      writeToStorage(next);
      return next;
    });
  }, []);

  return {
    coins,
    ids: coins.map((c) => c.id),
    add,
    remove,
    isFull: coins.length >= WATCHLIST_MAX_COINS,
  };
}
