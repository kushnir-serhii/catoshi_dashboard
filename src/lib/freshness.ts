/**
 * Data-freshness computation (spec 017, Slice 2).
 *
 * One pure module, shared by the UI staleness note and the `/api/health`
 * endpoint, so the two can never disagree about what "stale" means. The
 * threshold itself lives in `src/consts/collect.ts` as `SNAPSHOT_STALE_MINUTES`.
 *
 * The defect being regression-checked (`decisions.md` §3, instance 2) is a
 * "last updated" label that shows the render moment *instead of* the data's
 * timestamp. These functions take the data timestamp as their first argument
 * and "now" as an explicit second argument — never an implicit `Date.now()`
 * inside — so a caller must hold a real snapshot `ts` to get an age at all, and
 * the tests can advance the clock without the result moving.
 */

import { SNAPSHOT_STALE_MINUTES } from '@/consts/collect';
import { NEWS_CLASSIFY_ENABLED } from '@/consts/news';
import { SCHEDULED_FORECAST_LATE_AFTER_SECONDS } from '@/consts/projections';

/** Parses an ISO string or Date to epoch ms; returns `NaN` for anything unusable. */
function toEpochMs(ts: string | Date): number {
  return ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
}

/**
 * Age of a snapshot in whole minutes: `now - ts`, floored, never negative.
 * Returns `null` when `ts` is missing or unparseable — the caller renders a
 * "no data" state rather than a misleading number.
 */
export function snapshotAgeMinutes(
  ts: string | Date | null | undefined,
  now: number | Date = Date.now(),
): number | null {
  if (ts == null) return null;
  const tsMs = toEpochMs(ts);
  if (Number.isNaN(tsMs)) return null;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Math.max(0, Math.floor((nowMs - tsMs) / 60_000));
}

/**
 * True when the newest snapshot is older than `SNAPSHOT_STALE_MINUTES` — or
 * when there is no snapshot at all (no data is at least as stale as stale data).
 * The boundary is inclusive-fresh: an age exactly equal to the threshold is
 * still "fresh", stale begins one minute past it.
 */
export function isSnapshotStale(
  ts: string | Date | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  const age = snapshotAgeMinutes(ts, now);
  if (age === null) return true;
  return age > SNAPSHOT_STALE_MINUTES;
}

/**
 * The most recent of a set of timestamps (nulls and unparseable values ignored),
 * as an ISO string, or `null` when none are usable. Used by `/api/health` to
 * reduce the per-asset newest snapshots to a single "newest anywhere" value that
 * the OK/503 decision turns on.
 */
export function newestTimestamp(
  timestamps: readonly (string | Date | null | undefined)[],
): string | null {
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const ts of timestamps) {
    if (ts == null) continue;
    const ms = toEpochMs(ts);
    if (!Number.isNaN(ms) && ms > bestMs) bestMs = ms;
  }
  return bestMs === Number.NEGATIVE_INFINITY ? null : new Date(bestMs).toISOString();
}

/**
 * Whether the product's one background model call (news classification,
 * spec 015) is paused *according to the environment variable alone*
 * (`NEWS_CLASSIFY_ENABLED=false`). This is the cheap, synchronous view used by
 * `/api/health`, which stays an unauthenticated no-DB read (spec 022 §2.9).
 *
 * The admin-toggleable view — the `public.app_settings` row taking precedence,
 * with this env value as the fallback when the row is absent — lives in
 * `src/lib/news/pause.ts` (async, reads Postgres) and is what `/api/collect`
 * consults before each classification pass.
 */
export function isNewsClassificationPaused(): boolean {
  return !NEWS_CLASSIFY_ENABLED;
}

/** State of the spec 020 scheduled forecast producer, as reported by `/api/health`. */
export type ForecastIngestState = 'healthy' | 'late' | 'failing' | 'never-run';

/** The `public.collector_status` row for `forecast_ingest`, as `/api/health` reads it. */
export interface ForecastIngestStatusRow {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Derives the scheduled producer's state from its `collector_status` row
 * (spec 020 §2.5). `persistCollectorStatus` clears `last_error` on an accepted
 * ingest and sets it on a rejection while leaving `last_success_at` pointing at
 * the genuinely last accepted one — so a non-null `last_error` means the most
 * recent attempt failed (`failing`), and a rejected ingest can never read as
 * `healthy`.
 *
 * - `never-run`  — no row, or a row that has never recorded an accepted ingest
 *   and is not currently failing;
 * - `failing`    — the most recent attempt was rejected;
 * - `late`       — last accepted ingest is older than
 *   `SCHEDULED_FORECAST_LATE_AFTER_SECONDS` (reached before the freshness window
 *   elapses, so the operator learns the schedule stopped before the paid path
 *   engages);
 * - `healthy`    — last accepted ingest is within that window.
 */
export function forecastIngestState(
  row: ForecastIngestStatusRow | null | undefined,
  now: number | Date = Date.now(),
): ForecastIngestState {
  if (
    !row ||
    (row.lastSuccessAt === null && row.lastAttemptAt === null && row.lastError === null)
  ) {
    return 'never-run';
  }
  if (row.lastError !== null) return 'failing';
  if (row.lastSuccessAt === null) return 'never-run';

  const successMs = toEpochMs(row.lastSuccessAt);
  if (Number.isNaN(successMs)) return 'never-run';
  const nowMs = now instanceof Date ? now.getTime() : now;
  const ageSeconds = Math.max(0, (nowMs - successMs) / 1000);
  return ageSeconds > SCHEDULED_FORECAST_LATE_AFTER_SECONDS ? 'late' : 'healthy';
}

/**
 * Plain-words age for a staleness note, e.g. "3h ago", "45m ago", "2d ago".
 * Returns `null` when there is no usable timestamp.
 */
export function formatSnapshotAge(
  ts: string | Date | null | undefined,
  now: number | Date = Date.now(),
): string | null {
  const minutes = snapshotAgeMinutes(ts, now);
  if (minutes === null) return null;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Title + body for a Signals-page "nothing to show" panel. */
export interface EmptyStateCopy {
  title: string;
  body: string;
}

/**
 * Copy for the market-state empty state (spec 023, Slice 4). The page's own
 * `StaleCollectionNotice` banner already says collection may be stalled when
 * the newest snapshot is past `SNAPSHOT_STALE_MINUTES` — the empty state below
 * it used to say "Collection is healthy and up to date" regardless, so the
 * page contradicted itself on the same screen (`decisions.md` §3). The stale
 * variant drops the health claim and states the age instead.
 */
export function marketEmptyStateCopy(
  showStaleCollection: boolean,
  lastUpdated: string | Date | null | undefined,
  now: number | Date = Date.now(),
): EmptyStateCopy {
  if (showStaleCollection) {
    const age = formatSnapshotAge(lastUpdated, now) ?? 'a while ago';
    return {
      title: 'No signals right now',
      body: `Data last updated ${age} — collection may be stalled, so this may not reflect current market conditions.`,
    };
  }
  return {
    title: 'No signals right now',
    body: 'Collection is healthy and up to date — no tracked market condition has crossed a threshold worth flagging.',
  };
}
