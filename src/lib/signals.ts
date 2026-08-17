import type { SignalsResponse } from '@/data/types';

export async function fetchSignals(): Promise<SignalsResponse> {
  const res = await fetch('/api/signals');
  if (!res.ok) {
    throw new Error(`fetchSignals failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SignalsResponse;
}
