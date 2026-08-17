'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import type { CoinListItem } from '@/data/types';

const POPULAR_IDS = ['bitcoin', 'ethereum', 'solana', 'bittensor', 'chainlink', 'arbitrum'];

async function fetchCoinList(): Promise<CoinListItem[]> {
  const res = await fetch('/api/coins/list');
  if (!res.ok) throw new Error('Failed to fetch coin list');
  const data = (await res.json()) as { coins: CoinListItem[] };
  return data.coins;
}

export function useCoinSearch(): {
  search: (query: string) => CoinListItem[];
  isLoading: boolean;
} {
  const { data: coins, isLoading } = useSWR<CoinListItem[]>('coins-list', fetchCoinList, {
    keepPreviousData: true,
  });

  const popularCoins = useMemo<CoinListItem[]>(() => {
    if (!coins) return [];
    return POPULAR_IDS.flatMap((id) => {
      const found = coins.find((c) => c.id === id);
      return found ? [found] : [];
    });
  }, [coins]);

  const search = useMemo(() => {
    return (query: string): CoinListItem[] => {
      if (!coins) return [];

      const trimmed = query.trim();
      if (trimmed.length < 2) return popularCoins;

      const lower = trimmed.toLowerCase();
      const results: CoinListItem[] = [];

      for (const coin of coins) {
        if (
          coin.symbol.toLowerCase().includes(lower) ||
          coin.name.toLowerCase().includes(lower)
        ) {
          results.push(coin);
          if (results.length === 20) break;
        }
      }

      return results;
    };
  }, [coins, popularCoins]);

  return { search, isLoading };
}
