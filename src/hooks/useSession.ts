'use client';

import useSWR from 'swr';

/**
 * The single client-side source of who the viewer is (spec 022). A thin SWR
 * hook over `GET /api/me` — no polling, revalidate on focus. No component calls
 * Auth.js directly; identity is learned from this endpoint alone.
 *
 * `mutate` is called after a successful reforecast so the remaining count
 * updates from the same interaction (wired up in Slice 3).
 */

export interface SessionInfo {
  role: 'guest' | 'user' | 'admin';
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  remaining: number | null;
  resetsAt: string | null;
}

async function fetchMe(): Promise<SessionInfo> {
  const res = await fetch('/api/me');
  if (!res.ok) {
    throw new Error(`GET /api/me failed: ${res.status}`);
  }
  return (await res.json()) as SessionInfo;
}

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<SessionInfo>('me', fetchMe, {
    refreshInterval: 0,
    revalidateOnFocus: true,
  });

  return {
    session: data ?? null,
    isLoading: isLoading && !data,
    isError: !!error,
    mutate,
  };
}
