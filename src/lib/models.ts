import type { ModelsResponse } from '@/data/types';

/**
 * Client-side fetcher for the Models page calibration data (spec 011 Slice 5).
 * Mirrors `fetchSignals` in `src/lib/signals.ts`: a thin wrapper over the
 * Route Handler, which is the only place the database is touched.
 */
export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch('/api/models');
  if (!res.ok) {
    throw new Error(`fetchModels failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ModelsResponse;
}
