import type { SourceStatus } from '@/data/types';
import { query } from '@/lib/db/client';

/**
 * Persistence for `public.collector_status` (spec 017, Slice 3).
 *
 * `/api/collect` already tracks per-source outcomes within a single run
 * (`SourceStatus[]`). This module writes the last outcome per source to the
 * database so `/api/health` can report last-success times *across* runs — the
 * property that makes "one source down for six hours" distinguishable from "the
 * whole run failed once".
 *
 * Discipline mirrors the scoring/signals calls off the same collect run
 * (technical-considerations, spec 011 §5): every failure here is caught and
 * returned as a `SourceStatus`, never thrown — a bookkeeping write must not fail
 * a collection run whose snapshot data is the unrecoverable part.
 */

/** One source's outcome for this run, already reduced across assets. */
export interface CollectorOutcome {
  source: string;
  ok: boolean;
  error?: string;
}

/**
 * Reduces the collect run's `Record<symbol, SourceStatus[]>` to one outcome per
 * distinct source key. A source is counted as failed for the run if *any* of its
 * entries failed; its error is the first failure's message. Keys are qualified
 * by the asset symbol they belong to (e.g. `BTC:funding`) so a single asset's
 * feed failing is its own row; run-wide steps (`scoring`) keep their bare name.
 */
export function reduceSourceStatuses(
  sourcesBySymbol: Record<string, SourceStatus[]>,
  assetSymbols: readonly string[],
): CollectorOutcome[] {
  const byKey = new Map<string, CollectorOutcome>();

  for (const [group, statuses] of Object.entries(sourcesBySymbol)) {
    const isAsset = assetSymbols.includes(group);
    for (const status of statuses) {
      const key = isAsset ? `${group}:${status.source}` : status.source;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { source: key, ok: status.ok, error: status.ok ? undefined : status.error });
      } else if (existing.ok && !status.ok) {
        existing.ok = false;
        existing.error = status.error;
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Upserts one row per source outcome:
 * - `last_attempt_at = now()` always;
 * - on success, `last_success_at = now()` and `last_error` cleared to NULL;
 * - on failure, `last_error` set and `last_success_at` left untouched (so it
 *   keeps pointing at the genuinely last success).
 */
export async function persistCollectorStatus(
  outcomes: readonly CollectorOutcome[],
): Promise<{ written: number; error: Error | null }> {
  if (outcomes.length === 0) {
    return { written: 0, error: null };
  }

  const values: unknown[] = [];
  const rows = outcomes.map((outcome) => {
    const sourceParam = `$${values.length + 1}`;
    values.push(outcome.source);
    const errorParam = `$${values.length + 1}`;
    values.push(outcome.ok ? null : (outcome.error ?? 'unknown error'));
    // `now()` and the success flag are baked into SQL text, not parameters, so
    // every row in one statement shares a single transaction timestamp.
    const successAt = outcome.ok ? 'now()' : 'null';
    return `(${sourceParam}, now(), ${successAt}, ${errorParam}, now())`;
  });

  const sql = `
    insert into public.collector_status
      (source, last_attempt_at, last_success_at, last_error, updated_at)
    values ${rows.join(', ')}
    on conflict (source) do update set
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = coalesce(excluded.last_success_at, public.collector_status.last_success_at),
      last_error      = excluded.last_error,
      updated_at      = excluded.updated_at
  `;

  try {
    await query(sql, values);
    return { written: outcomes.length, error: null };
  } catch (error: unknown) {
    console.error('[collectorStatus] persistCollectorStatus failed:', error);
    return { written: 0, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
