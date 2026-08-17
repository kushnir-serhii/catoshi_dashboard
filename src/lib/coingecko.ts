import type { PriceMap } from '@/data/types';

export type { PriceMap };

export async function fetchPrices(ids: string[]): Promise<PriceMap> {
  const res = await fetch(`/api/prices?ids=${ids.join(",")}`);
  if (!res.ok) {
    throw new Error(`fetchPrices failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as unknown as PriceMap;
}
