'use client';

import useSWR from 'swr';

import { TODAY_REFRESH_INTERVAL_MS } from '@/consts/today';
import type { TodayResponse } from '@/data/types';

async function fetchToday(url: string): Promise<TodayResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`today fetch failed: ${res.status}`);
  return (await res.json()) as TodayResponse;
}

/**
 * Spec 024 short-horizon range for one coin. Pass `null` to skip fetching (gate
 * closed or untracked coin). The key includes the coin id and there is no
 * `keepPreviousData`, so a coin switch never shows the previous coin's numbers.
 */
export function useToday(coinId: string | null) {
  const { data, error, isLoading } = useSWR<TodayResponse>(
    coinId ? `/api/today?asset=${encodeURIComponent(coinId)}` : null,
    fetchToday,
    { refreshInterval: TODAY_REFRESH_INTERVAL_MS },
  );
  return { data: data ?? null, error, isLoading: isLoading && !data };
}
