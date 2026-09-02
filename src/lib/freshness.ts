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
