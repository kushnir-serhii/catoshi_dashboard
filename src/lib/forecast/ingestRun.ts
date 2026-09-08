import type { ForecastTarget } from '@/consts/projections';
import {
  DEFAULT_FORECAST_TARGETS,
  FORECAST_DAILY_INGEST_LIMIT,
  FORECAST_INGEST_COMPONENT,
  ROUTINE_PROMPT_VERSION,
  ROUTINE_SOURCE,
} from '@/consts/projections';
import type { StoredForecast } from '@/data/types';
import type { PersistForecastMeta } from '@/lib/db/analytics';
import { getDailyIngestCount, persistForecasts } from '@/lib/db/analytics';
import { type CollectorOutcome, persistCollectorStatus } from '@/lib/db/collectorStatus';

import { validateIngestBatch } from './ingest';
import { type ResolvedIngestContext, resolveIngestContext } from './ingestReferences';

/**
 * The orchestration behind `POST /api/projections/ingest` (spec 020), with its
 * I/O behind injectable seams so the guard flow can be tested without a DB —
 * same pattern as `classifyNews` (spec 015). The route wraps this with auth,
 * the mock-mode guard and JSON parsing.
 *
 * Order (functional-spec §2.2 / §2.4): daily ingest ceiling → resolve trusted
 * references → validate → persist (awaited) → invalidate the projections cache
 * **only after** a successful write. A rejected batch calls neither `persist`
 * nor `revalidate`, so the previously stored batch and its cache entry are
 * untouched.
 *
 * Every terminal outcome except a dead database (503) is recorded to
 * `public.collector_status` under `forecast_ingest` (§2.9): accepted ⇒ success,
 * everything else ⇒ failure with the reason, which is what keeps `/api/health`
 * from ever reading a rejected ingest as `healthy`.
 */
export interface IngestRunDeps {
  getDailyCount: () => Promise<number | null>;
  resolveContext: (targets: readonly ForecastTarget[]) => Promise<ResolvedIngestContext>;
  persist: (
    projections: Parameters<typeof persistForecasts>[0],
    snapshotIds: Record<string, number | null>,
    meta: PersistForecastMeta,
  ) => Promise<{ data: StoredForecast[] | null; error: Error | null }>;
  revalidate: () => void;
  /** Records this attempt's outcome. Non-fatal — a bookkeeping write must not
   * change the HTTP result. */
  recordStatus: (outcome: CollectorOutcome) => Promise<void>;
}

export const defaultIngestRunDeps: IngestRunDeps = {
  getDailyCount: () => getDailyIngestCount(ROUTINE_SOURCE),
  resolveContext: resolveIngestContext,
  persist: persistForecasts,
  revalidate: () => {},
  recordStatus: async (outcome) => {
    try {
      await persistCollectorStatus([outcome]);
    } catch (error: unknown) {
      console.error('[forecast-ingest] status write failed:', error);
    }
  },
};

export interface IngestRunResult {
  status: number;
  body: Record<string, unknown>;
}

export async function runIngest(
  payload: unknown,
  deps: IngestRunDeps = defaultIngestRunDeps,
): Promise<IngestRunResult> {
  const record = (ok: boolean, error?: string): Promise<void> =>
    deps.recordStatus({ source: FORECAST_INGEST_COMPONENT, ok, error });

  const dailyCount = await deps.getDailyCount();
  if (dailyCount === null) {
    // The status table lives in the same database — do not attempt a write.
    return { status: 503, body: { error: 'Unable to verify daily ingest limit' } };
  }
  if (dailyCount >= FORECAST_DAILY_INGEST_LIMIT) {
    await record(false, 'daily ingest limit reached');
    return {
      status: 429,
      body: {
        error: 'Daily ingest limit reached',
        count: dailyCount,
        limit: FORECAST_DAILY_INGEST_LIMIT,
      },
    };
  }

  const { references, snapshotLinks } = await deps.resolveContext(DEFAULT_FORECAST_TARGETS);
  const result = validateIngestBatch(payload, references, {
    asOf: new Date().toISOString(),
    targets: DEFAULT_FORECAST_TARGETS,
  });

  if (!result.ok) {
    const reason =
      result.rejections.map((r) => `${r.coin}:${r.check}`).join('; ') || 'validation failed';
    await record(false, reason);
    return {
      status: 422,
      body: { error: 'Ingest rejected', rejections: result.rejections, skipped: result.skipped },
    };
  }
  if (result.accepted.length === 0) {
    await record(false, 'no ingestable projections (all coins skipped)');
    return {
      status: 422,
      body: { error: 'No ingestable projections in batch', skipped: result.skipped },
    };
  }

  const { data, error } = await deps.persist(result.accepted, snapshotLinks, {
    source: ROUTINE_SOURCE,
    model: result.accepted[0].model,
    promptVersion: ROUTINE_PROMPT_VERSION,
    usage: null,
    costUsd: 0,
  });

  if (data === null || error !== null) {
    await record(false, 'persist failed');
    return { status: 500, body: { error: 'Failed to persist ingested batch' } };
  }
  if (data.length === 0) {
    await record(false, 'persist stored no rows');
    return { status: 500, body: { error: 'Ingested batch stored no rows' } };
  }

  deps.revalidate();
  await record(true);

  return {
    status: 200,
    body: {
      producer: ROUTINE_SOURCE,
      accepted: result.accepted.map((projection) => projection.coin),
      storedCount: data.length,
      skipped: result.skipped,
    },
  };
}
