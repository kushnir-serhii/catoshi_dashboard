'use client';

import useSWR from 'swr';

import { DEFAULT_FORECAST_MODEL, DEFAULT_FORECAST_SERVICE } from '@/consts/projections';
import type { CoinListItem, ProjectionsResponse } from '@/data/types';

async function fetchProjections(
  _key: string,
  service: string,
  model: string,
): Promise<ProjectionsResponse | null> {
  const params = new URLSearchParams({ service, model });
  const res = await fetch(`/api/projections?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchProjections failed: ${res.status}`);
  return res.json() as Promise<ProjectionsResponse | null>;
}

export function useProjections(
  service: string = DEFAULT_FORECAST_SERVICE,
  model: string = DEFAULT_FORECAST_MODEL,
) {
  const key = ['projections', service, model] as const;

  const {
    data,
    error,
    isLoading: swrLoading,
    mutate,
  } = useSWR<ProjectionsResponse | null>(
    key,
    (k: readonly [string, string, string]) => fetchProjections(k[0], k[1], k[2]),
    {
      refreshInterval: 60 * 60 * 1000,
      keepPreviousData: true,
    },
  );

  const isLoading = swrLoading && !data;
  const isStale = !!error && !!data;

  async function refresh(nextService: string, nextModel: string): Promise<void> {
    const res = await fetch('/api/projections/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: nextService, model: nextModel }),
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const fresh = (await res.json()) as ProjectionsResponse;
    await mutate(fresh, { revalidate: false });
  }

  /** Generates a real AI forecast for a single coin — the only way to get AI
   * coverage for a coin outside the default tracked batch — and merges the
   * result into the local projections list without touching any other
   * coin's cached forecast. */
  async function refreshCoin(
    coin: CoinListItem,
    nextService: string,
    nextModel: string,
  ): Promise<void> {
    const res = await fetch('/api/projections/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: nextService,
        model: nextModel,
        coin: { id: coin.id, symbol: coin.symbol, name: coin.name },
      }),
    });
    if (!res.ok) throw new Error(`refreshCoin failed: ${res.status}`);
    const fresh = (await res.json()) as ProjectionsResponse;
    const symbol = coin.symbol.toUpperCase();

    await mutate(
      (current) => {
        const kept = (current?.projections ?? []).filter((p) => p.coin !== symbol);
        return { projections: [...kept, ...fresh.projections], generatedAt: fresh.generatedAt };
      },
      { revalidate: false },
    );
  }

  return {
    projections: data?.projections ?? null,
    generatedAt: data?.generatedAt ?? null,
    isLoading,
    isStale,
    refresh,
    refreshCoin,
  };
}
