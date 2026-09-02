'use client';

import useSWR from 'swr';

import { SIGNALS_REFRESH_INTERVAL_MS } from '@/consts/signals';
import type { SignalsResponse } from '@/data/types';
import { fetchSignals } from '@/lib/signals';

export function useSignals() {
  const {
    data,
    error,
    isLoading: swrLoading,
  } = useSWR<SignalsResponse>('signals', fetchSignals, {
    refreshInterval: SIGNALS_REFRESH_INTERVAL_MS,
    keepPreviousData: true,
  });

  const isLoading = swrLoading && !data;
  const isStale = !!error && !!data;

  return {
    signals: data?.signals ?? null,
    newsSignals: data?.newsSignals ?? null,
    lastUpdated: data?.lastUpdated ?? null,
    nextUpdate: data?.nextUpdate ?? null,
    fetchError: data?.fetchError ?? false,
    collectionHealthy: data?.collectionHealthy ?? false,
    isLoading,
    isStale,
  };
}
