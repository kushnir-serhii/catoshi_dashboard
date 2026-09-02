/**
 * Tests for the data-freshness computation (spec 017, Slice 2).
 *
 * Run:  npx tsx src/scripts/freshness.test.ts
 *
 * No database, no network, no test runner — `src/lib/freshness.ts` is pure, so
 * fixtures and assertions are enough. Exits non-zero on failure.
 *
 * The regression this guards (`decisions.md` §3, instance 2): a "last updated"
 * label that shows the render moment instead of the data's timestamp. The proof
 * that it is fixed is that the displayed age is a pure function of (dataTs, now)
 * — advancing the clock while holding the data timestamp changes the age by
 * exactly the elapsed time and nothing else, and holding both fixed makes the
 * value immovable across repeated reads.
 */

import { SNAPSHOT_STALE_MINUTES } from '@/consts/collect';
import {
  formatSnapshotAge,
  isSnapshotStale,
  newestTimestamp,
  snapshotAgeMinutes,
} from '@/lib/freshness';

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

const DATA_TS = '2026-09-02T08:00:00.000Z';
const DATA_MS = Date.parse(DATA_TS);
const MIN = 60_000;

// ---------------------------------------------------------------------------
section('Age is a pure function of (dataTs, now)');
// ---------------------------------------------------------------------------

{
  // A fixed data timestamp, the clock advancing: the age tracks the clock and
  // nothing else — never the render moment.
  const at30 = snapshotAgeMinutes(DATA_TS, DATA_MS + 30 * MIN);
  const at90 = snapshotAgeMinutes(DATA_TS, DATA_MS + 90 * MIN);
  const at240 = snapshotAgeMinutes(DATA_TS, DATA_MS + 240 * MIN);
  check('30 minutes elapsed reads as 30', at30 === 30, `got ${at30}`);
  check('90 minutes elapsed reads as 90', at90 === 90, `got ${at90}`);
  check('240 minutes elapsed reads as 240', at240 === 240, `got ${at240}`);

  // Same inputs, repeated reads: immovable.
  const a = snapshotAgeMinutes(DATA_TS, DATA_MS + 123 * MIN);
  const b = snapshotAgeMinutes(DATA_TS, DATA_MS + 123 * MIN);
  check('repeated reads with identical inputs are equal', a === b && a === 123, `${a} vs ${b}`);

  // Holding `now` fixed and moving only the data timestamp DOES move the age —
  // this is the half that must not be frozen.
  const now = DATA_MS + 300 * MIN;
  const older = snapshotAgeMinutes('2026-09-02T06:00:00.000Z', now);
  const newer = snapshotAgeMinutes('2026-09-02T09:00:00.000Z', now);
  check('an older data timestamp yields a larger age', older === 420, `got ${older}`);
  check(
    'a newer data timestamp yields a smaller age',
    newer === 240 && older === 420 && newer < older,
    `got ${newer}`,
  );
}

{
  // A clock that runs backwards (skew) never yields a negative age.
  const negative = snapshotAgeMinutes(DATA_TS, DATA_MS - 10 * MIN);
  check('a "now" before the data timestamp clamps to 0', negative === 0, `got ${negative}`);
}

// ---------------------------------------------------------------------------
section('Stale boundary at SNAPSHOT_STALE_MINUTES');
// ---------------------------------------------------------------------------

{
  const justUnder = DATA_MS + (SNAPSHOT_STALE_MINUTES - 1) * MIN;
  const exactly = DATA_MS + SNAPSHOT_STALE_MINUTES * MIN;
  const justOver = DATA_MS + (SNAPSHOT_STALE_MINUTES + 1) * MIN;

  check('one minute under the threshold is fresh', isSnapshotStale(DATA_TS, justUnder) === false);
  check('exactly at the threshold is still fresh', isSnapshotStale(DATA_TS, exactly) === false);
  check('one minute over the threshold is stale', isSnapshotStale(DATA_TS, justOver) === true);
}

// ---------------------------------------------------------------------------
section('Missing data');
// ---------------------------------------------------------------------------

{
  check('null timestamp has no age', snapshotAgeMinutes(null, DATA_MS) === null);
  check('undefined timestamp has no age', snapshotAgeMinutes(undefined, DATA_MS) === null);
  check('garbage timestamp has no age', snapshotAgeMinutes('not-a-date', DATA_MS) === null);
  check('null timestamp is treated as stale', isSnapshotStale(null, DATA_MS) === true);
  check('garbage timestamp is treated as stale', isSnapshotStale('nope', DATA_MS) === true);
  check('null timestamp has no formatted age', formatSnapshotAge(null, DATA_MS) === null);
}

// ---------------------------------------------------------------------------
section('formatSnapshotAge wording');
// ---------------------------------------------------------------------------

{
  check(
    'under a minute reads "just now"',
    formatSnapshotAge(DATA_TS, DATA_MS + 30_000) === 'just now',
  );
  check('45 minutes reads "45m ago"', formatSnapshotAge(DATA_TS, DATA_MS + 45 * MIN) === '45m ago');
  check('3 hours reads "3h ago"', formatSnapshotAge(DATA_TS, DATA_MS + 180 * MIN) === '3h ago');
  check('2 days reads "2d ago"', formatSnapshotAge(DATA_TS, DATA_MS + 2880 * MIN) === '2d ago');
}

// ---------------------------------------------------------------------------
section('newestTimestamp');
// ---------------------------------------------------------------------------

{
  check(
    'picks the most recent of several',
    newestTimestamp([
      '2026-09-02T06:00:00.000Z',
      '2026-09-02T09:00:00.000Z',
      '2026-09-02T07:00:00.000Z',
    ]) === '2026-09-02T09:00:00.000Z',
  );
  check(
    'ignores nulls',
    newestTimestamp([null, DATA_TS, undefined]) === new Date(DATA_MS).toISOString(),
  );
  check('empty list yields null', newestTimestamp([]) === null);
  check('all-null list yields null', newestTimestamp([null, undefined]) === null);
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
