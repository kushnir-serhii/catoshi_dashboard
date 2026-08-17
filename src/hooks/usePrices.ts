'use client';

import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';
import { fetchPrices } from '@/lib/coingecko';
import type { PriceMap } from '@/data/types';
import { PRICES_REFRESH_INTERVAL_MS } from '@/consts/prices';

export function usePrices(ids: string[]) {
  // SWR key: stable string from ids
  const key = ids.join(',');

  const { data, error, isLoading: swrLoading, mutate } = useSWR<PriceMap>(
    key,
    () => fetchPrices(ids),
    {
      refreshInterval: PRICES_REFRESH_INTERVAL_MS,
      keepPreviousData: true,
    }
  );

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
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data]);

  return { prices: data ?? null, isLoading, isStale, countdown, error, mutate };
}
