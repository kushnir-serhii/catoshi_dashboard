import { query } from '@/lib/db/client';

/**
 * Read model for `GET /api/health` (spec 017, Slice 4).
 *
 * Two cheap, indexed reads and nothing else — no external API call, no raw row
 * or connection string in the result. Neon sleeps and this endpoint is meant to
 * be polled by a free external uptime checker every few minutes, so the query
 * count is kept to one per concern:
 *
 *  1. per tracked asset: newest snapshot `ts` and the count in the last 24h
 *     (both subqueries ride `idx_snapshots_asset_ts`);
 *  2. the whole `collector_status` table (one row per source, tiny).
 */

export interface AssetSnapshotHealth {
  symbol: string;
  /** ISO `ts` of the newest snapshot for this asset, or null when it has none. */
  newestTs: string | null;
  /** Count of snapshots in the last 24 hours. Expected: 24. */
  snapshots24h: number;
}

export interface CollectorHealthRow {
  source: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface HealthData {
  assets: AssetSnapshotHealth[];
  collectors: CollectorHealthRow[];
}

interface AssetRow {
  symbol: string;
  newest_ts: string | null;
  count_24h: string | number;
}

interface CollectorRow {
  source: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

export async function readHealthData(trackedSymbols: readonly string[]): Promise<HealthData> {
  const assetRows = await query<AssetRow>(
    `select a.symbol,
            (select max(ts) from public.snapshots where asset_id = a.id) as newest_ts,
            (select count(*) from public.snapshots
              where asset_id = a.id and ts > now() - interval '24 hours') as count_24h
       from public.assets a
      where a.symbol = any($1)`,
    [trackedSymbols as string[]],
  );

  const bySymbol = new Map(assetRows.map((row) => [row.symbol, row]));
  const assets: AssetSnapshotHealth[] = trackedSymbols.map((symbol) => {
    const row = bySymbol.get(symbol);
    return {
      symbol,
      newestTs: row?.newest_ts ?? null,
      snapshots24h: row ? Number(row.count_24h) : 0,
    };
  });

  const collectorRows = await query<CollectorRow>(
    `select source, last_success_at, last_attempt_at, last_error
       from public.collector_status
      order by source`,
  );

  const collectors: CollectorHealthRow[] = collectorRows.map((row) => ({
    source: row.source,
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
  }));

  return { assets, collectors };
}
