/**
 * Forecast resolution and scoring (spec 011, Slice 4).
 *
 * Each pass finds every `(forecast, horizon)` pair whose horizon has elapsed and
 * that has no outcome row yet, looks up the market price at the horizon, decides
 * which scenario happened, and writes an `outcomes` row with its Brier score.
 *
 * Pure maths lives in `./brier` and `./realizedScenario`; this module only does
 * the database lookups and the price sourcing around them.
 *
 * Placement and isolation (technical-considerations §5): this hangs off the
 * hourly `/api/collect` run, after snapshots commit — the same reasoning as
 * spec 014's signal generation. A lost snapshot hour is gone forever; a lost
 * scoring pass is simply recomputed next hour. So every failure here is caught,
 * surfaced through `SourceStatus`, and never allowed to fail the collect run.
 *
 * Idempotency: the "forecasts to resolve" query skips pairs that already have an
 * outcome, and the INSERT is `on conflict ... do nothing` against
 * `outcomes_forecast_horizon_key` (migration 0002). A re-run of the same hour
 * therefore writes nothing new and never changes an existing score — there is no
 * `do update` path.
 */

import { COINGECKO_API_KEY_HEADER } from '@/consts/prices';
import { RESOLUTION_PRICE_MAX_GAP_HOURS, SCORED_HORIZON_DAYS } from '@/consts/scoring';
import type { ForecastPoint, ScenarioProbabilities, SourceStatus } from '@/data/types';
import { query } from '@/lib/db/client';

import { brierScore } from './brier';
import {
  type RealizedScenario,
  realizedScenario,
  type ScenarioCurves,
  scenarioPricesAtHorizon,
} from './realizedScenario';

const DAY_MS = 86_400_000;
const MAX_GAP_MS = RESOLUTION_PRICE_MAX_GAP_HOURS * 3_600_000;

export interface ForecastResolutionResult {
  /** Number of new `outcomes` rows written this pass. */
  resolved: number;
  /** Pairs left for a later pass (horizon price not yet available, malformed curve, …). */
  skipped: number;
  /** Per-forecast failures, merged into the collection run's source report. */
  sources: SourceStatus[];
}

interface ResolveRow {
  forecast_id: number;
  horizon_days: number;
  asset_id: number;
  symbol: string;
  coingecko_id: string;
  as_of: string;
  scenarios: unknown;
  snapshot_price: string | number | null;
}

/**
 * One row per `(forecast, horizon)` that is due and unresolved.
 *
 * - `unnest($1::int[])` fans each forecast out to the scored horizons.
 * - `f.as_of + make_interval(days => h.horizon_days) <= now()` drops horizons
 *   that have not elapsed — a forecast whose horizon is still in the future is
 *   never returned, so it is left untouched.
 * - `not exists (… outcomes …)` drops pairs already resolved, which is what
 *   makes a re-run a no-op even before the INSERT's conflict guard.
 */
const RESOLVE_QUERY = `
  select
    f.id           as forecast_id,
    h.horizon_days as horizon_days,
    f.asset_id     as asset_id,
    a.symbol       as symbol,
    a.coingecko_id as coingecko_id,
    f.as_of        as as_of,
    f.scenarios    as scenarios,
    s.price        as snapshot_price
  from public.forecasts f
  join public.assets a on a.id = f.asset_id
  left join public.snapshots s on s.id = f.snapshot_id
  cross join lateral unnest($1::int[]) as h(horizon_days)
  where f.as_of + make_interval(days => h.horizon_days) <= now()
    and not exists (
      select 1
      from public.outcomes o
      where o.forecast_id = f.id
        and o.horizon_days = h.horizon_days
    )
  order by f.as_of asc, h.horizon_days asc
`;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Extracts the three scenario price curves from the stored `scenarios` jsonb. */
function parseCurves(scenarios: unknown): ScenarioCurves | null {
  if (!scenarios || typeof scenarios !== 'object') return null;
  const record = scenarios as Record<string, unknown>;
  if (!Array.isArray(record.bull) || !Array.isArray(record.base) || !Array.isArray(record.bear)) {
    // Pre-spec-011 rows stored only the probability map here — nothing to look
    // up a horizon price against. Back-filling those is explicitly out of scope.
    return null;
  }
  return {
    bull: record.bull as ForecastPoint[],
    base: record.base as ForecastPoint[],
    bear: record.bear as ForecastPoint[],
  };
}

/** Extracts the scenario probabilities from the stored `scenarios` jsonb. */
function parseProbabilities(scenarios: unknown): ScenarioProbabilities | null {
  if (!scenarios || typeof scenarios !== 'object') return null;
  const probs = (scenarios as Record<string, unknown>).probabilities;
  if (!probs || typeof probs !== 'object') return null;
  const record = probs as Record<string, unknown>;
  const bull = toFiniteNumber(record.bull);
  const base = toFiniteNumber(record.base);
  const bear = toFiniteNumber(record.bear);
  if (bull === null || base === null || bear === null) return null;
  return { bull, base, bear };
}

/** Nearest stored snapshot price at or before `targetMs`, within the gap tolerance. */
async function snapshotPriceNear(assetId: number, targetMs: number): Promise<number | null> {
  const rows = await query<{ price: string; ts: string }>(
    `select price, ts
       from public.snapshots
      where asset_id = $1 and ts <= $2
      order by ts desc
      limit 1`,
    [assetId, new Date(targetMs).toISOString()],
  );
  if (rows.length === 0) return null;
  const gap = targetMs - new Date(rows[0].ts).getTime();
  if (gap > MAX_GAP_MS) return null;
  return toFiniteNumber(rows[0].price);
}

/** Nearest CoinGecko daily close to `targetMs`, within the gap tolerance. */
async function coingeckoPriceNear(coingeckoId: string, targetMs: number): Promise<number | null> {
  const baseUrl = process.env.COINGECKO_BASE_URL;
  if (!baseUrl || !coingeckoId) return null;

  const ageDays = Math.ceil((Date.now() - targetMs) / DAY_MS) + 2;
  const days = Math.min(Math.max(ageDays, 1), 365);
  const url = `${baseUrl}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey ? { [COINGECKO_API_KEY_HEADER]: apiKey } : {};

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { prices?: [number, number][] };
  const points = data.prices ?? [];

  let best: [number, number] | null = null;
  for (const point of points) {
    if (!best || Math.abs(point[0] - targetMs) < Math.abs(best[0] - targetMs)) {
      best = point;
    }
  }
  if (!best || Math.abs(best[0] - targetMs) > MAX_GAP_MS) return null;
  return toFiniteNumber(best[1]);
}

/** Observed market price near `targetMs`: stored snapshot first, CoinGecko as fallback. */
async function marketPriceNear(
  assetId: number,
  coingeckoId: string,
  targetMs: number,
): Promise<number | null> {
  const fromSnapshot = await snapshotPriceNear(assetId, targetMs);
  if (fromSnapshot !== null) return fromSnapshot;
  return coingeckoPriceNear(coingeckoId, targetMs);
}

/**
 * Resolves one `(forecast, horizon)` pair.
 *
 * @returns `'resolved'` when an outcome row was written, `'skipped'` when the
 *   pair is left for a later pass (no throw path — callers treat a throw as a
 *   surfaced failure).
 */
async function resolveOne(row: ResolveRow): Promise<'resolved' | 'skipped'> {
  const asOfMs = new Date(row.as_of).getTime();
  const horizonMs = asOfMs + row.horizon_days * DAY_MS;

  const curves = parseCurves(row.scenarios);
  if (!curves) return 'skipped';

  // Sparse-horizon behaviour is "skip" (SPARSE_HORIZON_BEHAVIOUR): no point at
  // the exact horizon on every curve → no outcome row, leave it unresolved.
  const predicted = scenarioPricesAtHorizon(curves, row.horizon_days);
  if (!predicted) return 'skipped';

  // Actual market price at the horizon. Missing → skip and retry next hour; a
  // stored snapshot or CoinGecko point may still land.
  const actualPrice = await marketPriceNear(row.asset_id, row.coingecko_id, horizonMs);
  if (actualPrice === null) return 'skipped';

  const realized: RealizedScenario | null = realizedScenario(predicted, actualPrice);

  // entry_price is the MARKET price at as_of, never forecasts.anchor_price:
  // the linked snapshot's price when present (already age-bounded at write
  // time), otherwise the price series.
  let entryPrice = toFiniteNumber(row.snapshot_price);
  if (entryPrice === null) {
    entryPrice = await marketPriceNear(row.asset_id, row.coingecko_id, asOfMs);
  }

  // brier_score is written only when the outcome is genuinely scoreable —
  // otherwise NULL, never zero (functional-spec 2.3). Unscoreable =
  // realizedScenario returned null (degenerate curve), probabilities rejected,
  // or no market entry price to anchor the outcome.
  let brier: number | null = null;
  if (realized !== null && entryPrice !== null) {
    const probabilities = parseProbabilities(row.scenarios);
    if (probabilities !== null) {
      try {
        brier = brierScore(probabilities, realized);
      } catch {
        brier = null;
      }
    }
  }

  const inserted = await query<{ id: number }>(
    `insert into public.outcomes
       (forecast_id, horizon_days, evaluated_at, entry_price, actual_price, realized_scenario, brier_score)
     values ($1, $2, now(), $3, $4, $5, $6)
     on conflict on constraint outcomes_forecast_horizon_key do nothing
     returning id`,
    [row.forecast_id, row.horizon_days, entryPrice, actualPrice, realized, brier],
  );

  return inserted.length > 0 ? 'resolved' : 'skipped';
}

/**
 * Runs one resolution pass over every due, unresolved `(forecast, horizon)` pair.
 *
 * Never throws: a failure loading the work list is returned as a single failed
 * `SourceStatus`; a per-forecast failure is caught, logged and surfaced as its
 * own `SourceStatus`, and the pass continues with the next forecast.
 */
export async function resolveForecasts(): Promise<ForecastResolutionResult> {
  const sources: SourceStatus[] = [];

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    // Mock mode never persists real forecasts, so there is nothing to resolve
    // and the CoinGecko fallback must not reach the network.
    return { resolved: 0, skipped: 0, sources };
  }

  let rows: ResolveRow[];
  try {
    rows = await query<ResolveRow>(RESOLVE_QUERY, [SCORED_HORIZON_DAYS]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[scoring] failed to load forecasts to resolve:', error);
    return { resolved: 0, skipped: 0, sources: [{ source: 'scoring', ok: false, error: message }] };
  }

  let resolved = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const result = await resolveOne(row);
      if (result === 'resolved') {
        resolved += 1;
      } else {
        skipped += 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[scoring] resolve failed for forecast ${row.forecast_id} @ ${row.horizon_days}d:`,
        error,
      );
      sources.push({
        source: `scoring:forecast:${row.forecast_id}:h${row.horizon_days}`,
        ok: false,
        error: message,
      });
    }
  }

  return { resolved, skipped, sources };
}
