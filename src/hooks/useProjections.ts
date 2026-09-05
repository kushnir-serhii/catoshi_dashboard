'use client';

import useSWR from 'swr';

import { DEFAULT_FORECAST_MODEL, DEFAULT_FORECAST_SERVICE } from '@/consts/projections';
import type { CoinListItem, ProjectionsResponse } from '@/data/types';

interface ForecastRefreshErrorBody {
  error?: string;
  count?: number;
  limit?: number;
}

/** Structured error thrown by `refresh`/`refreshCoin` on any non-2xx response
 * from `POST /api/projections/refresh`, so UI callers can branch on `status`
 * (401 operator unlock, 429 daily limit with `count`/`limit`, 503 disabled)
 * instead of parsing a generic error message. */
export class ForecastRefreshError extends Error {
  readonly status: number;
  readonly count?: number;
  readonly limit?: number;

  constructor(status: number, body: ForecastRefreshErrorBody | null) {
    super(body?.error ?? `refresh failed: ${status}`);
    this.name = 'ForecastRefreshError';
    this.status = status;
    this.count = body?.count;
    this.limit = body?.limit;
  }
}

/** Maps a refresh failure to a short, user-facing message. Named states per
 * spec 019 slice 3: 401 → operator unlock, 429 → daily limit (with the real
 * count/limit from the response body), 503 → refresh disabled. Anything else
 * (500, network error, non-ForecastRefreshError) falls back to a generic
 * message — the point is simply that nothing is ever silently swallowed. */
export function describeRefreshError(err: unknown): string {
  if (err instanceof ForecastRefreshError) {
    if (err.status === 401) return 'Operator unlock required';
    if (err.status === 429) {
      return err.count !== undefined && err.limit !== undefined
        ? `Daily limit reached (${err.count}/${err.limit})`
        : 'Daily limit reached';
    }
    if (err.status === 503) return 'Refresh disabled';
  }
  return 'Reforecast failed';
}

async function readErrorBody(res: Response): Promise<ForecastRefreshErrorBody | null> {
  try {
    return (await res.json()) as ForecastRefreshErrorBody;
  } catch {
    return null;
  }
}

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
    if (!res.ok) throw new ForecastRefreshError(res.status, await readErrorBody(res));
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
    if (!res.ok) throw new ForecastRefreshError(res.status, await readErrorBody(res));
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
