/**
 * Tests for the `/api/health` staleness decision (spec 017, Slice 4).
 *
 * Run:  npx tsx src/scripts/health.test.ts
 *
 * `/api/health` returns HTTP 200 when the newest snapshot across every tracked
 * asset is fresh and 503 otherwise, so a free external uptime checker can watch
 * one URL. That decision is exactly `!isSnapshotStale(newestTimestamp(...))`
 * from `src/lib/freshness.ts`; this suite pins its four corners — fresh, exactly
 * at the threshold, well past it, and no snapshots at all (which must not throw
 * and must report non-OK).
 *
 * No database, no network. Exits non-zero on failure.
 */

import { SNAPSHOT_STALE_MINUTES } from '@/consts/collect';
import { isSnapshotStale, newestTimestamp, snapshotAgeMinutes } from '@/lib/freshness';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const MIN = 60_000;

/** Mirrors the route: OK iff the newest snapshot anywhere is not stale. */
function overallOk(assetTimestamps: (string | null)[], now: number): boolean {
  return !isSnapshotStale(newestTimestamp(assetTimestamps), now);
}

// ---------------------------------------------------------------------------
section('Fresh — 200');
// ---------------------------------------------------------------------------

{
  const ts = new Date(NOW - 20 * MIN).toISOString();
  check('a 20-minute-old newest snapshot is OK', overallOk([ts, ts, ts], NOW) === true);
  check(
    'one stale asset but another fresh: newest wins, OK',
    overallOk([new Date(NOW - 300 * MIN).toISOString(), ts, null], NOW) === true,
  );
}

// ---------------------------------------------------------------------------
section('Exactly at the threshold — still 200');
// ---------------------------------------------------------------------------

{
  const ts = new Date(NOW - SNAPSHOT_STALE_MINUTES * MIN).toISOString();
  check('age exactly SNAPSHOT_STALE_MINUTES is not stale', overallOk([ts], NOW) === true);
  check(
    'age one minute past the threshold is stale',
    overallOk([new Date(NOW - (SNAPSHOT_STALE_MINUTES + 1) * MIN).toISOString()], NOW) === false,
  );
}

// ---------------------------------------------------------------------------
section('Well past the threshold — 503');
// ---------------------------------------------------------------------------

{
  const ts = new Date(NOW - 26 * 60 * MIN).toISOString(); // ~26 hours
  check('a 26-hour-old newest snapshot is not OK', overallOk([ts, ts, ts], NOW) === false);
  check('and its age is reported, not thrown', snapshotAgeMinutes(ts, NOW) === 26 * 60);
}

// ---------------------------------------------------------------------------
section('No snapshots at all — must not throw, reports non-OK');
// ---------------------------------------------------------------------------

{
  let threw = false;
  let ok = true;
  try {
    ok = overallOk([null, null, null], NOW);
  } catch {
    threw = true;
  }
  check('empty pipeline does not throw', threw === false);
  check('empty pipeline is non-OK', ok === false);
  check('empty pipeline newestTimestamp is null', newestTimestamp([null, null, null]) === null);
  check('empty pipeline age is null, not a number', snapshotAgeMinutes(null, NOW) === null);
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
