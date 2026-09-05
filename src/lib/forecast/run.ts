import type { ForecastTarget } from '@/consts/projections';
import { FORECAST_SNAPSHOT_MAX_AGE_MINUTES } from '@/consts/scoring';
import type { ProjectionData } from '@/data/types';
import { getLatestSnapshot, persistForecasts } from '@/lib/db/analytics';
import { validateForecastParams } from '@/lib/forecast/params';
import { generateForecast } from '@/lib/forecastProvider';
import { fetchMarketData } from '@/lib/marketData';

export interface RunForecastOptions {
  targets: readonly ForecastTarget[];
  service: string;
  model: string;
  /** true on the manual path: the caller reports whether the row was stored. */
  awaitPersist?: boolean;
}

export interface RunForecastResult {
  projections: ProjectionData[];
  generatedAt: string;
  service: string;
  model: string;
  persisted?: boolean;
}

/**
 * Runs one forecast generation end to end: validate params, fetch market
 * data, call the AI provider, resolve each target's snapshot link, and
 * persist the resulting rows. Consolidated from `/api/projections` and
 * `/api/projections/refresh` (spec 019) so both routes share one
 * implementation; the `unstable_cache` wrapper around a cached call to this
 * function stays a route-level concern (technical-considerations §2.3), not
 * part of this function.
 */
export async function runForecast(options: RunForecastOptions): Promise<RunForecastResult> {
  const { targets, awaitPersist = false } = options;
  const { service, model } = validateForecastParams(options.service, options.model);

  const marketData = await fetchMarketData(targets);
  const result = await generateForecast(service, model, marketData, targets);

  // Resolve each target coin's most recent snapshot id (or null) so the
  // forecast rows can be linked to the conditions they were made under.
  // Done here (inside the cache callback), not in GET, so a cache hit
  // never touches the DB — see AC 2.1/2.6.
  //
  // Snapshot age limit (spec 011, functional-spec 2.6): link a forecast to
  // a snapshot only when that snapshot is within
  // FORECAST_SNAPSHOT_MAX_AGE_MINUTES of now. An older snapshot is not
  // "conditions that were actually current", so the forecast is recorded
  // with snapshot_id = null instead — calibration reads (Slice 5) exclude
  // those rows rather than trust a stale link.
  const maxSnapshotAgeMs = FORECAST_SNAPSHOT_MAX_AGE_MINUTES * 60_000;
  const snapshotIds: Record<string, number | null> = {};
  await Promise.all(
    targets.map(async (target) => {
      const snapshot = await getLatestSnapshot(target.symbol);
      const withinAgeLimit =
        snapshot != null && Date.now() - new Date(snapshot.ts).getTime() <= maxSnapshotAgeMs;
      snapshotIds[target.symbol] = withinAgeLimit ? (snapshot.id ?? null) : null;
    }),
  );

  let persisted: boolean | undefined;
  if (awaitPersist) {
    const { data, error } = await persistForecasts(
      result.projections,
      snapshotIds,
      result.usage,
      result.promptVersion,
    );
    persisted = data !== null && error === null;
    if (!persisted) {
      console.error('[forecast-persist]', error);
    }
  } else {
    // Deliberately not awaited (AC 2.6): an unreachable/slow DB must never
    // degrade this route's response time or success. Errors are logged,
    // never thrown into the request path.
    void persistForecasts(
      result.projections,
      snapshotIds,
      result.usage,
      result.promptVersion,
    ).catch((e) => console.error('[forecast-persist]', e));
  }

  return {
    projections: result.projections,
    generatedAt: new Date().toISOString(),
    service,
    model,
    persisted,
  };
}
