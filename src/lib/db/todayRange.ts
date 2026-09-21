import { query } from '@/lib/db/client';

/**
 * Persistence for `public.today_range_predictions` (spec 024, Slice 4;
 * migration `0011_today_range_predictions.sql`).
 *
 * The SQL text and row mappers are exported separately from the functions that
 * run them so they can be inspected and unit-tested without a database. The
 * orchestration lives in `src/lib/todayScoring.ts`.
 *
 * `pg` returns `numeric`, `bigint` and `timestamptz` as strings/Date; mappers
 * coerce them. Every parameter is cast explicitly: in an `insert ... select`
 * an untyped `$n` in the select list resolves to text and would fail the
 * assignment cast into a numeric/bigint column.
 */

export type DbId = string | number;

export interface PredictionInsert {
  assetId: DbId;
  issuedAt: Date;
  horizonEnd: Date;
  /** Start (inclusive) and end (exclusive) of the UTC day containing `issuedAt`. */
  dayStart: Date;
  dayEnd: Date;
  spot: number;
  sigmaHourly: number;
  k: number;
  modelVersion: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
}

export interface UnresolvedPrediction {
  id: DbId;
  symbol: string;
  binancePair: string;
  issuedAt: Date;
  horizonEnd: Date;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
}

export interface PredictionResolution {
  realizedClose: number;
  realizedHigh: number;
  realizedLow: number;
  inBand50: boolean;
  inBand90: boolean;
  resolvedAt: Date;
}

export interface ResolvedTrackRow {
  modelVersion: number;
  resolvedAt: Date;
  inBand50: boolean;
  inBand90: boolean;
}

/** Look up the asset row by symbol (`assets.symbol`, unique). */
export const ASSET_ID_SQL = `select id from public.assets where symbol = $1`;

/**
 * Has this asset already got a prediction issued inside `[dayStart, dayEnd)`?
 * A half-open range on the raw column (rather than `date_trunc(...)`) keeps it
 * index-friendly on `UNIQUE (asset_id, issued_at)`.
 */
export const HAS_ISSUED_SQL = `
  select 1
  from public.today_range_predictions
  where asset_id = $1::bigint
    and issued_at >= $2::timestamptz
    and issued_at <  $3::timestamptz
  limit 1
`;

/**
 * Atomic issue-once-per-UTC-day insert. `where not exists` skips the insert when
 * the asset already has a row that UTC day (dedupe by asset + day, not just the
 * exact timestamp); `on conflict (asset_id, issued_at) do nothing` covers two
 * concurrent runs in the same hour. Returns the new id, or no row when skipped.
 */
export const INSERT_PREDICTION_SQL = `
  insert into public.today_range_predictions
    (asset_id, issued_at, horizon_end, spot, sigma_hourly, k, model_version,
     p05, p25, p75, p95)
  select
    $1::bigint, $2::timestamptz, $3::timestamptz, $4::numeric, $5::numeric,
    $6::numeric, $7::int, $8::numeric, $9::numeric, $10::numeric, $11::numeric
  where not exists (
    select 1
    from public.today_range_predictions
    where asset_id = $1::bigint
      and issued_at >= $12::timestamptz
      and issued_at <  $13::timestamptz
  )
  on conflict (asset_id, issued_at) do nothing
  returning id
`;

/** Rows whose horizon has elapsed as of `$1` and that have not been resolved yet. */
export const UNRESOLVED_SQL = `
  select p.id, a.symbol, a.binance_pair, p.issued_at, p.horizon_end,
         p.p05, p.p25, p.p75, p.p95
  from public.today_range_predictions p
  join public.assets a on a.id = p.asset_id
  where p.resolved_at is null
    and p.horizon_end <= $1::timestamptz
  order by p.horizon_end asc
`;

/** Write the realized values once; `resolved_at is null` keeps a resolved row immutable. */
export const RESOLVE_SQL = `
  update public.today_range_predictions
  set realized_close = $2::numeric,
      realized_high  = $3::numeric,
      realized_low   = $4::numeric,
      in_band_50     = $5::boolean,
      in_band_90     = $6::boolean,
      resolved_at    = $7::timestamptz
  where id = $1::bigint
    and resolved_at is null
`;

/** Last `$3` resolved rows of the CURRENT model version `$2` for CoinGecko id `$1`. */
export const TRACK_SQL = `
  select p.model_version, p.resolved_at, p.in_band_50, p.in_band_90
  from public.today_range_predictions p
  join public.assets a on a.id = p.asset_id
  where a.coingecko_id = $1
    and p.model_version = $2::int
    and p.resolved_at is not null
  order by p.resolved_at desc
  limit $3::int
`;

interface UnresolvedRow {
  id: DbId;
  symbol: string;
  binance_pair: string;
  issued_at: Date | string;
  horizon_end: Date | string;
  p05: string | number;
  p25: string | number;
  p75: string | number;
  p95: string | number;
}

interface TrackRow {
  model_version: number;
  resolved_at: Date | string;
  in_band_50: boolean;
  in_band_90: boolean;
}

export function mapUnresolvedRow(row: UnresolvedRow): UnresolvedPrediction {
  return {
    id: row.id,
    symbol: row.symbol,
    binancePair: row.binance_pair,
    issuedAt: new Date(row.issued_at),
    horizonEnd: new Date(row.horizon_end),
    p05: Number(row.p05),
    p25: Number(row.p25),
    p75: Number(row.p75),
    p95: Number(row.p95),
  };
}

export function mapTrackRow(row: TrackRow): ResolvedTrackRow {
  return {
    modelVersion: Number(row.model_version),
    resolvedAt: new Date(row.resolved_at),
    inBand50: row.in_band_50,
    inBand90: row.in_band_90,
  };
}

export function insertParams(p: PredictionInsert): unknown[] {
  return [
    p.assetId,
    p.issuedAt.toISOString(),
    p.horizonEnd.toISOString(),
    p.spot,
    p.sigmaHourly,
    p.k,
    p.modelVersion,
    p.p05,
    p.p25,
    p.p75,
    p.p95,
    p.dayStart.toISOString(),
    p.dayEnd.toISOString(),
  ];
}

export async function findAssetId(symbol: string): Promise<DbId | null> {
  const rows = await query<{ id: DbId }>(ASSET_ID_SQL, [symbol]);
  return rows.length === 0 ? null : rows[0].id;
}

export async function hasIssuedInDay(
  assetId: DbId,
  dayStart: Date,
  dayEnd: Date,
): Promise<boolean> {
  const rows = await query(HAS_ISSUED_SQL, [assetId, dayStart.toISOString(), dayEnd.toISOString()]);
  return rows.length > 0;
}

/** True when a new row was written, false when the day/hour already had one. */
export async function insertPrediction(p: PredictionInsert): Promise<boolean> {
  const rows = await query(INSERT_PREDICTION_SQL, insertParams(p));
  return rows.length > 0;
}

export async function listUnresolved(now: Date): Promise<UnresolvedPrediction[]> {
  const rows = await query<UnresolvedRow>(UNRESOLVED_SQL, [now.toISOString()]);
  return rows.map(mapUnresolvedRow);
}

export async function markResolved(id: DbId, r: PredictionResolution): Promise<void> {
  await query(RESOLVE_SQL, [
    id,
    r.realizedClose,
    r.realizedHigh,
    r.realizedLow,
    r.inBand50,
    r.inBand90,
    r.resolvedAt.toISOString(),
  ]);
}

export async function readResolvedTrackRows(
  coingeckoId: string,
  modelVersion: number,
  limit: number,
): Promise<ResolvedTrackRow[]> {
  const rows = await query<TrackRow>(TRACK_SQL, [coingeckoId, modelVersion, limit]);
  return rows.map(mapTrackRow);
}
