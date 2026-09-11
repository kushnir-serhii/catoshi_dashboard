import { allowanceWindowStart } from '@/lib/auth/allowance';
import { query } from '@/lib/db/client';

/**
 * Impure half of the per-person reforecast allowance (spec 022 §2.5). The
 * arithmetic lives in `src/lib/auth/allowance.ts`; this module only touches
 * Postgres. Server-only — never import into a client component.
 */

interface ResetAtRow {
  allowance_reset_at: string | null;
}

interface UsageCountRow {
  used: string;
}

/**
 * Reads the person's current usage against the allowance window:
 * `allowance_reset_at` off the user row, then the count of `forecast_usage`
 * rows since `allowanceWindowStart(now, resetAt)`.
 *
 * Returns `null` on any database failure — a count that cannot be read is not
 * zero, and the refresh route must fail closed (503) rather than hand out a
 * free forecast.
 */
export async function readUsage(
  userId: number,
): Promise<{ usedCount: number; resetAt: Date | null } | null> {
  try {
    const userRows = await query<ResetAtRow>(
      `select allowance_reset_at from public.users where id = $1`,
      [userId],
    );
    if (userRows.length === 0) {
      return null;
    }
    const resetAt = userRows[0].allowance_reset_at
      ? new Date(userRows[0].allowance_reset_at)
      : null;

    const windowStart = allowanceWindowStart(new Date(), resetAt);
    const usageRows = await query<UsageCountRow>(
      `select count(*)::text as used
         from public.forecast_usage
        where user_id = $1 and created_at >= $2`,
      [userId, windowStart.toISOString()],
    );

    return { usedCount: Number(usageRows[0]?.used ?? '0'), resetAt };
  } catch (error: unknown) {
    console.error('[allowance] readUsage failed:', error);
    return null;
  }
}

/**
 * Appends one `forecast_usage` row — called only after a forecast was actually
 * produced (spec 022 §2.6 step 5). Throwing is the caller's signal to log and
 * carry on; the forecast has already been served.
 */
export async function recordUsage(userId: number, forecastAsOf: Date | null): Promise<void> {
  await query(`insert into public.forecast_usage (user_id, forecast_as_of) values ($1, $2)`, [
    userId,
    forecastAsOf ? forecastAsOf.toISOString() : null,
  ]);
}

/**
 * Admin action: restore a person's allowance for the current UTC day by moving
 * their window start to now. The ledger keeps the full spend history.
 */
export async function restoreAllowance(userId: number): Promise<void> {
  await query(`update public.users set allowance_reset_at = now() where id = $1`, [userId]);
}
