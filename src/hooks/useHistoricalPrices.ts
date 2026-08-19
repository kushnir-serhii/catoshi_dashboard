'use client';

import useSWR from 'swr';
import type { HistoricalPrice } from '@/data/types';

async function fetchHistoricalPrices(
  coinId: string,
  days: number,
): Promise<HistoricalPrice[]> {
  const res = await fetch(`/api/prices/history?id=${coinId}&days=${days}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch price history: ${res.status}`);
  }
  const json = (await res.json()) as { prices: HistoricalPrice[] };
  return json.prices;
}

export function useHistoricalPrices(coinId: string, days: number) {
  const { data, error, isLoading: swrLoading, mutate } = useSWR<HistoricalPrice[]>(
    ['history', coinId, days],
    () => fetchHistoricalPrices(coinId, days),
    { keepPreviousData: true },
  );

  // isLoading = true only on first load, not during background revalidation
  const isLoading = swrLoading && !data;
  return {
    data,
    isLoading,
    error,
    mutate,
  };
}
