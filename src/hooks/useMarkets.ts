'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { PRICES_REFRESH_INTERVAL_MS } from '@/consts/prices';
import type { MarketListItem } from '@/data/types';

async function fetchMarkets(url: string): Promise<MarketListItem[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch markets');
  return res.json() as Promise<MarketListItem[]>;
}

/**
 * Build the request URL for a given id set. No ids → the plain `/api/markets`
 * key, byte-identical to the top-markets call `MarketsPage` makes. An empty
 * array → `null`, which tells SWR not to fetch (the empty-watchlist state).
 */
function marketsKey(ids?: string[]): string | null {
  if (ids === undefined) return '/api/markets';
  if (ids.length === 0) return null;
  return `/api/markets?ids=${encodeURIComponent(ids.join(','))}`;
}

export function useMarkets(ids?: string[]) {
  const key = marketsKey(ids);

  const {
    data,
    error,
    isLoading: swrLoading,
  } = useSWR<MarketListItem[]>(key, fetchMarkets, {
    refreshInterval: PRICES_REFRESH_INTERVAL_MS,
    keepPreviousData: true,
  });

  // isLoading = true only on first load (no prior data)
  const isLoading = swrLoading && !data;

  // isStale = true when the most recent fetch failed but we still have data
  const isStale = !!error && !!data;

  // countdown: counts down from PRICES_REFRESH_INTERVAL_MS/1000 to 0, resets on new data
  const [countdown, setCountdown] = useState(PRICES_REFRESH_INTERVAL_MS / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset countdown whenever data changes (successful fetch)
    setCountdown(PRICES_REFRESH_INTERVAL_MS / 1000);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data]);

  return { assets: data ?? null, isLoading, isStale, countdown };
}
