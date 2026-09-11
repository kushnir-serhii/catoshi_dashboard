import { DAILY_FORECAST_ALLOWANCE, type Role, ROLE_ADMIN } from '@/consts/auth';

/**
 * Pure allowance arithmetic (spec 022 §2.5). No database, no `Date.now()` calls
 * inside the exported functions — every time input is passed in, so the rules
 * that can silently be wrong are testable without a database
 * (`src/scripts/allowance.test.ts`). The impure half lives in
 * `src/lib/db/allowance.ts`.
 */

/**
 * Forecasts a person may still produce in the current window.
 *
 * - `null` for an admin — an admin has no count to show and is never
 *   rate-limited.
 * - Otherwise `DAILY_FORECAST_ALLOWANCE - usedCount`, clamped at zero so a
 *   restored-then-spent history can never report a negative remaining.
 */
export function remainingAllowance(usedCount: number, role: Role): number | null {
  if (role === ROLE_ADMIN) {
    return null;
  }
  return Math.max(0, DAILY_FORECAST_ALLOWANCE - usedCount);
}

/** 00:00:00.000 UTC of the given instant's calendar date. */
function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Start of the person's current allowance window: the later of the current UTC
 * midnight and their `allowance_reset_at` (null unless an admin restored today's
 * allowance). Usage rows at or after this instant count against the allowance.
 */
export function allowanceWindowStart(now: Date, resetAt: Date | null): Date {
  const midnight = utcMidnight(now);
  if (resetAt && resetAt.getTime() > midnight.getTime()) {
    return resetAt;
  }
  return midnight;
}

/**
 * Next 00:00:00.000 UTC strictly after `now` — the instant the allowance comes
 * back for everyone. Named in the exhausted-allowance message so the reset time
 * is never left for the client to guess.
 */
export function nextResetAt(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
}
