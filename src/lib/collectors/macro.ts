import {
  FRED_API_BASE_URL,
  MACRO_FETCH_INTERVAL_HOURS,
  MACRO_FETCH_TIMEOUT_MS,
  MACRO_SERIES,
  type MacroSeriesId,
} from '@/consts/macro';
import type { SourceStatus } from '@/data/types';
import { loadLastMacroFetchAt, type MacroReadingInsert, upsertMacroReadings } from '@/lib/db/macro';

/**
 * Macro collector (spec 027, Slice 3): fetches FRED observations for the series
 * in `MACRO_SERIES` and upserts them into `public.macro_readings`.
 *
 * - Keyed FRED API only (`FRED_API_KEY`); a missing key reports a failing
 *   `macro` status so the operator sees it, never a silent skip.
 * - Gated to once per `MACRO_FETCH_INTERVAL_HOURS` via `max(fetched_at)`.
 * - Each fetch has a hard `MACRO_FETCH_TIMEOUT_MS`; series are fetched in parallel.
 * - FRED's "." (missing day) is skipped, never stored as 0.
 * - Never throws: every failure is returned as a `SourceStatus`.
 */

const SOURCE = 'macro';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Lookback window: enough for the latest two readings of a weekly series. */
const MACRO_LOOKBACK_DAYS = 30;

export interface CollectMacroDeps {
  now?: Date;
  fetchFn?: typeof fetch;
  loadLastFetchAt?: () => Promise<Date | null>;
  upsert?: (readings: readonly MacroReadingInsert[]) => Promise<number>;
}

export interface CollectMacroResult {
  sources: SourceStatus[];
  /** Rows fetched per series (series that failed are absent). */
  rowsBySeries: Partial<Record<MacroSeriesId, number>>;
  /** Latest observation date per series fetched this run. */
  latestObsDate: Partial<Record<MacroSeriesId, string>>;
}

interface FredObservation {
  date?: unknown;
  value?: unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses a FRED payload into readings; "." and non-finite values are skipped. */
export function parseFredObservations(series: string, body: unknown): MacroReadingInsert[] {
  const observations = (body as { observations?: unknown } | null)?.observations;
  if (!Array.isArray(observations)) {
    throw new Error(`${series}: malformed FRED response`);
  }
  const out: MacroReadingInsert[] = [];
  for (const obs of observations as FredObservation[]) {
    if (typeof obs.date !== 'string' || typeof obs.value !== 'string') continue;
    if (obs.value.trim() === '.') continue;
    const value = Number(obs.value);
    if (!Number.isFinite(value)) continue;
    out.push({ series, obsDate: obs.date, value });
  }
  return out;
}

async function fetchSeries(
  series: MacroSeriesId,
  apiKey: string,
  now: Date,
  fetchFn: typeof fetch,
): Promise<MacroReadingInsert[]> {
  const start = new Date(now.getTime() - MACRO_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    series_id: series,
    api_key: apiKey,
    file_type: 'json',
    observation_start: start,
  });
  const res = await fetchFn(`${FRED_API_BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(MACRO_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${series}: FRED HTTP ${res.status}`);
  return parseFredObservations(series, await res.json());
}

export async function collectMacro(deps: CollectMacroDeps = {}): Promise<CollectMacroResult> {
  const now = deps.now ?? new Date();
  const rowsBySeries: CollectMacroResult['rowsBySeries'] = {};
  const latestObsDate: CollectMacroResult['latestObsDate'] = {};
  const result = (status: SourceStatus): CollectMacroResult => ({
    sources: [status],
    rowsBySeries,
    latestObsDate,
  });

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return result({ source: SOURCE, ok: true });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return result({ source: SOURCE, ok: false, error: 'FRED_API_KEY not set' });
  }

  // 6h gate. No prior fetch -> run. A gate skip is a non-failing status.
  try {
    const lastFetchAt = await (deps.loadLastFetchAt ?? loadLastMacroFetchAt)();
    if (
      lastFetchAt &&
      now.getTime() - lastFetchAt.getTime() < MACRO_FETCH_INTERVAL_HOURS * HOUR_MS
    ) {
      return result({ source: SOURCE, ok: true });
    }
  } catch (error: unknown) {
    return result({ source: SOURCE, ok: false, error: errorMessage(error) });
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const settled = await Promise.allSettled(
    MACRO_SERIES.map((series) => fetchSeries(series, apiKey, now, fetchFn)),
  );

  const readings: MacroReadingInsert[] = [];
  const failures: string[] = [];
  settled.forEach((outcome, i) => {
    const series = MACRO_SERIES[i];
    if (outcome.status === 'fulfilled') {
      readings.push(...outcome.value);
      rowsBySeries[series] = outcome.value.length;
      const dates = outcome.value.map((r) => r.obsDate).sort();
      if (dates.length > 0) latestObsDate[series] = dates[dates.length - 1];
    } else {
      // Message only, with the key redacted in case an error echoes the URL.
      failures.push(`${series}: ${errorMessage(outcome.reason).replaceAll(apiKey, '***')}`);
    }
  });

  // Persist whatever succeeded even if another series failed.
  try {
    await (deps.upsert ?? upsertMacroReadings)(readings);
  } catch (error: unknown) {
    return result({ source: SOURCE, ok: false, error: `db upsert failed: ${errorMessage(error)}` });
  }

  if (failures.length > 0) {
    return result({ source: SOURCE, ok: false, error: failures.join('; ') });
  }
  return result({ source: SOURCE, ok: true, note: `rows=${readings.length}` });
}
