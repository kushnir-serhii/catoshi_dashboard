'use client';

import useSWR from 'swr';

import { SIGNALS_REFRESH_INTERVAL_MS } from '@/consts/signals';
import type { ModelsResponse } from '@/data/types';
import { fetchModels } from '@/lib/models';

/**
 * Calibration data for the Models page (spec 011 Slice 5). Follows the
 * `useSignals` pattern: SWR over a thin `/api/models` fetcher, poll on the
 * same cadence as the signals feed (scoring runs on the same hourly collect
 * job), keep the previous page visible while revalidating.
 */
export function useModels() {
  const {
    data,
    error,
    isLoading: swrLoading,
  } = useSWR<ModelsResponse>('models', fetchModels, {
    refreshInterval: SIGNALS_REFRESH_INTERVAL_MS,
    keepPreviousData: true,
  });

  const isLoading = swrLoading && !data;
  const isStale = !!error && !!data;

  return {
    groups: data?.groups ?? [],
    exclusions: data?.exclusions ?? null,
    fetchError: data?.fetchError ?? false,
    isLoading,
    isStale,
  };
}
