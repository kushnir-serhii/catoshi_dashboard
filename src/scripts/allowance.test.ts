/**
 * Allowance maths tests for spec 022 (§2.5 / §2.6).
 *
 * Run:  npx tsx src/scripts/allowance.test.ts
 *
 * No database, no network, no test runner — the allowance arithmetic and the
 * refusal mapping are pure. Follows the `src/scripts/scoring.test.ts` pattern:
 * a `check(name, ok)` harness counting failures, `section` headers, and
 * `process.exit(failures === 0 ? 0 : 1)`.
 *
 * The UTC-boundary cases are the ones that will actually occur and the ones no
 * reviewer would catch by eye.
 */

import { ROLE_ADMIN, ROLE_USER } from '@/consts/auth';
import {
  describeRefreshError,
  exhaustedAllowanceMessage,
  ForecastRefreshError,
} from '@/hooks/useProjections';
import { allowanceWindowStart, nextResetAt, remainingAllowance } from '@/lib/auth/allowance';

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

const iso = (s: string): Date => new Date(s);

// ---------------------------------------------------------------------------
section('remainingAllowance');
// ---------------------------------------------------------------------------

check('normal decrement: 0 used → 3', remainingAllowance(0, ROLE_USER) === 3);
check('normal decrement: 1 used → 2', remainingAllowance(1, ROLE_USER) === 2);
check('normal decrement: 2 used → 1', remainingAllowance(2, ROLE_USER) === 1);
check('exact exhaustion: 3 used → 0', remainingAllowance(3, ROLE_USER) === 0);
check('clamp at zero: 4 used → 0', remainingAllowance(4, ROLE_USER) === 0);
check('clamp at zero: 99 used → 0', remainingAllowance(99, ROLE_USER) === 0);
check('admin: always null (0 used)', remainingAllowance(0, ROLE_ADMIN) === null);
check('admin: always null (10 used)', remainingAllowance(10, ROLE_ADMIN) === null);

// ---------------------------------------------------------------------------
section('allowanceWindowStart — later of UTC midnight and resetAt');
// ---------------------------------------------------------------------------

{
  const now = iso('2026-09-10T14:30:00.000Z');
  const midnight = '2026-09-10T00:00:00.000Z';

  check(
    'no resetAt → UTC midnight of now',
    allowanceWindowStart(now, null).toISOString() === midnight,
  );

  check(
    'resetAt earlier than midnight → midnight wins',
    allowanceWindowStart(now, iso('2026-09-09T23:00:00.000Z')).toISOString() === midnight,
  );

  check(
    'resetAt later than midnight → resetAt wins',
    allowanceWindowStart(now, iso('2026-09-10T09:15:00.000Z')).toISOString() ===
      '2026-09-10T09:15:00.000Z',
  );

  check(
    'resetAt exactly at midnight → midnight (equal, not strictly later)',
    allowanceWindowStart(now, iso(midnight)).toISOString() === midnight,
  );

  check(
    'resetAt from a prior day → midnight wins',
    allowanceWindowStart(now, iso('2026-01-01T12:00:00.000Z')).toISOString() === midnight,
  );
}

// ---------------------------------------------------------------------------
section('nextResetAt — next 00:00 UTC strictly after now');
// ---------------------------------------------------------------------------

check(
  'mid-day → next midnight',
  nextResetAt(iso('2026-09-10T14:30:00.000Z')).toISOString() === '2026-09-11T00:00:00.000Z',
);
check(
  'one second before midnight → the coming midnight',
  nextResetAt(iso('2026-09-10T23:59:59.000Z')).toISOString() === '2026-09-11T00:00:00.000Z',
);
check(
  'exactly at midnight → the following midnight (strictly after)',
  nextResetAt(iso('2026-09-10T00:00:00.000Z')).toISOString() === '2026-09-11T00:00:00.000Z',
);
check(
  'day boundary (month end) → first of next month',
  nextResetAt(iso('2026-09-30T18:00:00.000Z')).toISOString() === '2026-10-01T00:00:00.000Z',
);
check(
  'year boundary → Jan 1 next year',
  nextResetAt(iso('2026-12-31T23:00:00.000Z')).toISOString() === '2027-01-01T00:00:00.000Z',
);
check(
  'leap day: 2028-02-28 → 2028-02-29',
  nextResetAt(iso('2028-02-28T12:00:00.000Z')).toISOString() === '2028-02-29T00:00:00.000Z',
);
check(
  'leap day: 2028-02-29 → 2028-03-01',
  nextResetAt(iso('2028-02-29T12:00:00.000Z')).toISOString() === '2028-03-01T00:00:00.000Z',
);
check(
  'non-leap year: 2027-02-28 → 2027-03-01',
  nextResetAt(iso('2027-02-28T12:00:00.000Z')).toISOString() === '2027-03-01T00:00:00.000Z',
);

// ---------------------------------------------------------------------------
section('window start — a usage at 23:59:59 UTC is not counted at 00:00:01 next day');
// ---------------------------------------------------------------------------

{
  const usageAt = iso('2026-09-10T23:59:59.000Z');
  const nowNextDay = iso('2026-09-11T00:00:01.000Z');
  const windowStart = allowanceWindowStart(nowNextDay, null);
  check(
    'window start (next day, no reset) is 2026-09-11T00:00:00Z',
    windowStart.toISOString() === '2026-09-11T00:00:00.000Z',
  );
  check(
    "yesterday's 23:59:59 usage falls before the window → not counted",
    usageAt.getTime() < windowStart.getTime(),
  );
}

// ---------------------------------------------------------------------------
section('describeRefreshError — the new contract');
// ---------------------------------------------------------------------------

check(
  '401 → "Sign in to reforecast"',
  describeRefreshError(new ForecastRefreshError(401, { reason: 'signin-required' })) ===
    'Sign in to reforecast',
);

{
  const msg = describeRefreshError(
    new ForecastRefreshError(429, {
      reason: 'allowance-exhausted',
      remaining: 0,
      resetsAt: '2026-09-11T00:00:00.000Z',
    }),
  );
  check(
    '429 with resetsAt names the time',
    msg === "You've used all 3 forecasts today. They reset at 00:00 UTC.",
    msg,
  );
}

{
  const msg = describeRefreshError(
    new ForecastRefreshError(429, { reason: 'allowance-exhausted' }),
  );
  check(
    '429 without resetsAt falls back to "midnight UTC"',
    msg === "You've used all 3 forecasts today. They reset at midnight UTC.",
    msg,
  );
}

check(
  '503 → temporarily unavailable',
  describeRefreshError(new ForecastRefreshError(503, { reason: 'db-unavailable' })) ===
    'Reforecast is temporarily unavailable — please try again.',
);

check(
  '500 → generic fallback',
  describeRefreshError(new ForecastRefreshError(500, null)) === 'Reforecast failed',
);

check(
  'non-ForecastRefreshError → generic fallback',
  describeRefreshError(new Error('network down')) === 'Reforecast failed',
);

check(
  'no "Operator unlock" wording remains for 401',
  !describeRefreshError(new ForecastRefreshError(401, null)).toLowerCase().includes('operator'),
);

check(
  'exhaustedAllowanceMessage with a real time',
  exhaustedAllowanceMessage('2026-09-11T00:00:00.000Z') ===
    "You've used all 3 forecasts today. They reset at 00:00 UTC.",
);
check(
  'exhaustedAllowanceMessage with null',
  exhaustedAllowanceMessage(null) ===
    "You've used all 3 forecasts today. They reset at midnight UTC.",
);

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
