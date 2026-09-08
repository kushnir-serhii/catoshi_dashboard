import type { ForecastTarget } from '@/consts/projections';
import { FORECAST_SNAPSHOT_MAX_AGE_MINUTES } from '@/consts/scoring';
import { getAssetIdsBySymbol, getLatestSnapshot } from '@/lib/db/analytics';
import { fetchLiveUsdPrices } from '@/lib/marketData';

import type { IngestReferences } from './ingest';

/**
 * Server-trusted context for one ingest attempt (spec 020, Slice 3): the
 * per-coin reference price the anchor check runs against, plus the per-coin
 * snapshot id `persistForecasts` links stored rows to.
 *
 * Reference price per coin: the latest snapshot's price when that snapshot is
 * within `FORECAST_SNAPSHOT_MAX_AGE_MINUTES`, otherwise the live CoinGecko spot
 * price (the same source `/api/prices` uses). When neither is available the
 * reference is `null` and `validateIngestBatch` rejects that coin's ingest at
 * the `anchor` check — an unverifiable anchor is the one thing this design
 * cannot wave through (functional-spec §2.4).
 */
export interface ResolvedIngestContext {
  references: IngestReferences;
  /** coin symbol → most-recent snapshot id within the age limit, else null. */
  snapshotLinks: Record<string, number | null>;
}

export async function resolveIngestContext(
  targets: readonly ForecastTarget[],
): Promise<ResolvedIngestContext> {
  const maxAgeMs = FORECAST_SNAPSHOT_MAX_AGE_MINUTES * 60_000;

  const [assetIds, snapshots] = await Promise.all([
    getAssetIdsBySymbol(targets.map((t) => t.symbol.toUpperCase())),
    Promise.all(targets.map((t) => getLatestSnapshot(t.symbol))),
  ]);

  const isFresh = (index: number): boolean => {
    const snapshot = snapshots[index];
    return snapshot != null && Date.now() - new Date(snapshot.ts).getTime() <= maxAgeMs;
  };

  // Live price only for coins without a fresh snapshot — one CoinGecko call.
  const staleCoinIds = targets.filter((_, i) => !isFresh(i)).map((t) => t.id);
  const livePrices = await fetchLiveUsdPrices(staleCoinIds);

  const references: IngestReferences = {};
  const snapshotLinks: Record<string, number | null> = {};

  targets.forEach((target, index) => {
    const symbol = target.symbol.toUpperCase();
    const snapshot = snapshots[index];
    const fresh = isFresh(index);

    references[symbol] = {
      referencePrice: fresh ? snapshot!.price : (livePrices[target.id] ?? null),
      hasAsset: assetIds[symbol] !== undefined,
    };
    snapshotLinks[target.symbol] = fresh ? (snapshot!.id ?? null) : null;
  });

  return { references, snapshotLinks };
}
