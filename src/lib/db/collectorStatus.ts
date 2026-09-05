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
  /**
   * True when this source was deliberately skipped this run (e.g.
   * `NEWS_CLASSIFY_ENABLED=false`), not attempted and not failed. A disabled
   * outcome must never be treated as a success for `last_success_at` purposes
   * (spec 019, Slice 4) — "we chose not to run it" is a different fact from
   * "it succeeded."
   */
  disabled?: boolean;
}

/**
 * Reduces the collect run's `Record<symbol, SourceStatus[]>` to one outcome per
 * distinct source key. A source is counted as failed for the run if *any* of its
 * entries failed; its error is the first failure's message. Keys are qualified
 * by the asset symbol they belong to (e.g. `BTC:funding`) so a single asset's
 * feed failing is its own row; run-wide steps (`scoring`) keep their bare name.
 *
 * Precedence when a key has a mix of statuses across its entries: a failure
 * always wins (any `ok: false` makes the reduced outcome failed); otherwise a
 * `disabled: true` entry marks the reduced outcome disabled; only when every
 * entry is a plain success is the outcome a plain success. This is defensive —
 * in practice `news:classify` is a single run-wide key with exactly one entry.
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
        byKey.set(key, {
          source: key,
          ok: status.ok,
          error: status.ok ? undefined : status.error,
          disabled: status.ok ? status.disabled : undefined,
        });
      } else if (existing.ok && !status.ok) {
        existing.ok = false;
        existing.error = status.error;
        existing.disabled = undefined;
      } else if (existing.ok && status.ok && status.disabled && !existing.disabled) {
        existing.disabled = true;
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Upserts one row per source outcome:
 * - `last_attempt_at = now()` always — an attempt was made, or a deliberate
 *   choice was reached, either way this run touched that step;
 * - on success (`ok: true`, not disabled), `last_success_at = now()` and
 *   `last_error` cleared to NULL;
 * - on failure (`ok: false`), `last_error` set and `last_success_at` left
 *   untouched (so it keeps pointing at the genuinely last success);
 * - on a deliberate pause (`disabled: true`), neither `last_success_at` nor
 *   `last_error` is touched — a pause is neither a success nor a failure, so
 *   both columns keep whatever they last legitimately held. Without this,
 *   re-enabling classification after a long pause and reading `last_success_at`
 *   would look like "just ran" instead of "last ran before the pause."
 */
export async function persistCollectorStatus(
  outcomes: readonly CollectorOutcome[],
): Promise<{ written: number; error: Error | null }> {
  if (outcomes.length === 0) {
    return { written: 0, error: null };
  }

  // Split into two groups so each can use its own ON CONFLICT SET clause —
  // there's no `disabled` column on `public.collector_status` (no migration
  // in this task), so the only way to leave `last_success_at`/`last_error`
  // genuinely untouched on a disabled outcome is to omit them from that
  // statement's SET list entirely, rather than try to express a per-row
  // "skip this column" flag inside one shared statement.
  const disabled = outcomes.filter((outcome) => outcome.disabled);
  const settled = outcomes.filter((outcome) => !outcome.disabled);

  try {
    if (settled.length > 0) {
      const values: unknown[] = [];
      const rows = settled.map((outcome) => {
        const sourceParam = `$${values.length + 1}`;
        values.push(outcome.source);
        const errorParam = `$${values.length + 1}`;
        values.push(outcome.ok ? null : (outcome.error ?? 'unknown error'));
        // `now()` and the success flag are baked into SQL text, not
        // parameters, so every row in one statement shares a single
        // transaction timestamp.
        const successAt = outcome.ok ? 'now()' : 'null';
        return `(${sourceParam}, now(), ${successAt}, ${errorParam}, now())`;
      });

      await query(
        `
          insert into public.collector_status
            (source, last_attempt_at, last_success_at, last_error, updated_at)
          values ${rows.join(', ')}
          on conflict (source) do update set
            last_attempt_at = excluded.last_attempt_at,
            last_success_at = coalesce(excluded.last_success_at, public.collector_status.last_success_at),
            last_error      = excluded.last_error,
            updated_at      = excluded.updated_at
        `,
        values,
      );
    }

    if (disabled.length > 0) {
      const values: unknown[] = [];
      const rows = disabled.map((outcome) => {
        const sourceParam = `$${values.length + 1}`;
        values.push(outcome.source);
        return `(${sourceParam}, now(), now())`;
      });

      // Deliberately no `last_success_at` / `last_error` in the SET clause
      // below — on an existing row this leaves both columns exactly as they
      // were before this run; on a brand-new row they insert as NULL, which
      // is correct since there is no prior state to preserve.
      await query(
        `
          insert into public.collector_status
            (source, last_attempt_at, updated_at)
          values ${rows.join(', ')}
          on conflict (source) do update set
            last_attempt_at = excluded.last_attempt_at,
            updated_at      = excluded.updated_at
        `,
        values,
      );
    }

    return { written: outcomes.length, error: null };
  } catch (error: unknown) {
    console.error('[collectorStatus] persistCollectorStatus failed:', error);
    return { written: 0, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
