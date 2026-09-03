/**
 * State-vector construction tests for spec 012 (the Gate, Slice 0).
 *
 * Run:  npx tsx src/scripts/analog-vector.test.ts
 *
 * No database, no network, no test runner — pure functions, plain assertions,
 * non-zero exit on failure.
 *
 * decisions.md §8 defect 1 / spec 012 technical-considerations §2.1:
 * `snapshots.etf_streak_days` is an UNSIGNED consecutive-day count; direction is
 * carried separately by `etf_net_flow_usd`. The reference `build_state_vec`
 * mapped dimension 16 as `etf_streak_days / 10` into −1..1, assuming a sign the
 * column never carries — an inflow streak and an outflow streak of equal length
 * would collapse onto the same point. `signedEtfStreakDays` recombines the sign
 * in the vector builder (leaving the collector and the spec-014 rule untouched).
 *
 * These checks fail if that helper is reverted to passing the raw count through.
 */

import { signedEtfStreakDays } from './analog-core';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- the sign comes from the flow -----------------------------------------

check('inflow streak is positive', signedEtfStreakDays(7, 120_000_000) === 7);

// The defect: an unsigned pass-through would report +7 for an outflow streak.
check('outflow streak is negative', signedEtfStreakDays(7, -120_000_000) === -7);

{
  const inflow = signedEtfStreakDays(5, 90_000_000);
  const outflow = signedEtfStreakDays(5, -90_000_000);
  check(
    'equal-length inflow and outflow streaks are mirrored, not identical',
    inflow === 5 && outflow === -5,
    `${inflow} vs ${outflow}`,
  );
}

// Magnitude from the count, sign purely from the flow — an already-signed
// input must not double-apply.
check('sign is taken from the flow, not the count', signedEtfStreakDays(-7, 120_000_000) === 7);

// --- no direction / missing inputs -> neutral (null), never a signed value

check('zero net flow has no direction', signedEtfStreakDays(9, 0) === null);
check('null streak -> null', signedEtfStreakDays(null, 1) === null);
check('undefined streak -> null', signedEtfStreakDays(undefined, 1) === null);
check('null flow -> null', signedEtfStreakDays(9, null) === null);
check('NaN flow -> null', signedEtfStreakDays(9, Number.NaN) === null);
check('non-finite streak -> null', signedEtfStreakDays(Number.POSITIVE_INFINITY, 1) === null);

// A zero-length streak is still zero, whatever the flow sign.
check('zero streak stays zero', signedEtfStreakDays(0, -5) === 0);

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
