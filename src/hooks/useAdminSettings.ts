'use client';

import useSWR from 'swr';

/**
 * Admin-page reads for the operator controls that moved behind the admin role
 * (spec 022 §2.9):
 *
 *   - `useNewsPause`  — `GET/PATCH /api/admin/settings/news-pause` (admin-only)
 *   - `useHealth`     — `GET /api/health` (unauthenticated and unchanged; the
 *                       admin page just renders its payload with per-collector
 *                       detail)
 */

interface NewsPauseResponse {
  paused: boolean;
}

async function fetchNewsPause(): Promise<NewsPauseResponse> {
  const res = await fetch('/api/admin/settings/news-pause');
  if (!res.ok) {
    throw new Error(`GET /api/admin/settings/news-pause failed: ${res.status}`);
  }
  return (await res.json()) as NewsPauseResponse;
}

export function useNewsPause() {
  const { data, error, isLoading, mutate } = useSWR<NewsPauseResponse>(
    'admin-news-pause',
    fetchNewsPause,
    { refreshInterval: 0, revalidateOnFocus: true },
  );

  return {
    paused: data?.paused ?? null,
    isLoading: isLoading && !data,
    isError: !!error,
    mutate,
  };
}

export interface HealthAsset {
  symbol: string;
  newestSnapshotTs: string | null;
  ageMinutes: number | null;
  snapshots24h: number;
  stale: boolean;
}

export interface HealthCollector {
  source: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface HealthPayload {
  ok: boolean;
  checkedAt: string;
  staleThresholdMinutes: number;
  newestSnapshotTs: string | null;
  newestSnapshotAgeMinutes: number | null;
  assets: HealthAsset[];
  collectors: HealthCollector[];
  newsClassificationPaused: boolean;
  forecastIngest: {
    state: string;
    lastAcceptedAt: string | null;
    lastAcceptedAgeMinutes: number | null;
    lastRejectionReason: string | null;
  };
}

async function fetchHealth(): Promise<HealthPayload> {
  // `/api/health` answers 200 when fresh and 503 when stale, both with a full
  // JSON payload — a 503 is a real result to render, not a fetch failure.
  const res = await fetch('/api/health');
  return (await res.json()) as HealthPayload;
}

export function useHealth() {
  const { data, error, isLoading, mutate } = useSWR<HealthPayload>('admin-health', fetchHealth, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  return {
    health: data ?? null,
    isLoading: isLoading && !data,
    isError: !!error,
    mutate,
  };
}
