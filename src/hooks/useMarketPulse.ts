'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { SIGNALS_REFRESH_INTERVAL_MS } from '@/consts/signals';
import type { PulseResponse, PulseScope } from '@/data/types';

type PulseOk = Extract<PulseResponse, { status: 'ok' }>;

async function fetchPulse(scope: PulseScope): Promise<PulseResponse> {
  const res = await fetch(`/api/pulse?scope=${encodeURIComponent(scope)}`);
  if (!res.ok) {
    throw new Error(`fetchPulse failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as PulseResponse;
}

export function useMarketPulse(scope: PulseScope) {
  const {
    data,
    error,
    isLoading: swrLoading,
  } = useSWR<PulseResponse>(['pulse', scope], () => fetchPulse(scope), {
    refreshInterval: SIGNALS_REFRESH_INTERVAL_MS,
  });

  // Last `ok` payload seen per scope. Updated during render (React's
  // "adjust state on prop change" pattern) so no effect or ref write is needed.
  const [heldByScope, setHeldByScope] = useState<Partial<Record<PulseScope, PulseOk>>>({});
  if (data?.status === 'ok' && data.scope === scope && heldByScope[scope] !== data) {
    setHeldByScope((prev) => ({ ...prev, [scope]: data }));
  }

  const lastOk: PulseOk | null = heldByScope[scope] ?? null;
  const isLoading = swrLoading && !data;

  return { data, lastOk, isLoading, error };
}
