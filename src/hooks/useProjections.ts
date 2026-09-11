'use client';

import useSWR, { mutate as globalMutate } from 'swr';

import { DEFAULT_FORECAST_MODEL, DEFAULT_FORECAST_SERVICE } from '@/consts/projections';
import type { CoinListItem, ProjectionsResponse } from '@/data/types';

interface ForecastRefreshErrorBody {
  error?: string;
  reason?: string;
  /** Next 00:00 UTC as an ISO string (429 `allowance-exhausted`). */
  resetsAt?: string;
  remaining?: number;
}

/** Structured error thrown by `refresh`/`refreshCoin` on any non-2xx response
 * from `POST /api/projections/refresh`, so UI callers can branch on `status`
 * instead of parsing a generic error message (spec 022 §2.6): 401 →
 * sign-in required, 429 → allowance exhausted (with `resetsAt`), 503 →
 * temporarily unavailable. */
export class ForecastRefreshError extends Error {
  readonly status: number;
  readonly reason?: string;
  readonly resetsAt?: string;
  readonly remaining?: number;

  constructor(status: number, body: ForecastRefreshErrorBody | null) {
    super(body?.error ?? `refresh failed: ${status}`);
    this.name = 'ForecastRefreshError';
    this.status = status;
    this.reason = body?.reason;
    this.resetsAt = body?.resetsAt;
    this.remaining = body?.remaining;
  }
}

/** Formats an ISO instant as "HH:MM UTC". */
export function formatUtcTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'midnight UTC';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/** The exhausted-allowance message, naming the reset time. Shared by the 429
 * mapping and the client-side courtesy refusal on the Reforecast button. */
export function exhaustedAllowanceMessage(resetsAt: string | null): string {
  const when = resetsAt ? formatUtcTime(resetsAt) : 'midnight UTC';
  return `You've used all 3 forecasts today. They reset at ${when}.`;
}

/** Maps a refresh failure to a short, user-facing message (spec 022 §2.6).
 * 401 → sign in, 429 → allowance exhausted naming the reset time, 503 →
 * temporarily unavailable. Anything else (500, network error) falls back to a
 * generic message — nothing is ever silently swallowed. */
export function describeRefreshError(err: unknown): string {
  if (err instanceof ForecastRefreshError) {
    if (err.status === 401) return 'Sign in to reforecast';
    if (err.status === 429) return exhaustedAllowanceMessage(err.resetsAt ?? null);
    if (err.status === 503) return 'Reforecast is temporarily unavailable — please try again.';
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
    // Refresh `/api/me` so the button's remaining count updates from the same
    // interaction that redrew the chart (spec 022 §2.8).
    void globalMutate('me');
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
    void globalMutate('me');
  }

  return {
    projections: data?.projections ?? null,
    generatedAt: data?.generatedAt ?? null,
    /** Who produced the batch on screen (spec 020 §2.3): `scheduled`,
     * `on-demand` or `mock`. Null until the first response lands. */
    producer: data?.producer ?? null,
    isLoading,
    isStale,
    refresh,
    refreshCoin,
  };
}
