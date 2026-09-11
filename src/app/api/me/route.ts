import { NextResponse } from 'next/server';

import { DAILY_FORECAST_ALLOWANCE, ROLE_ADMIN } from '@/consts/auth';
import { getCurrentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

/**
 * `GET /api/me` — the client's single identity read (spec 022 §2.4).
 *
 * Guest (no session): `role: 'guest'`, everything else null, `remaining: null`.
 * User: role from the row, `remaining` = allowance minus today's usage, clamped
 * at 0. Admin: `remaining: null` (no count to show).
 *
 * ALWAYS HTTP 200 — being a guest is not an error. Never cached.
 *
 * NOTE: Slice 3 introduces `src/lib/auth/allowance.ts` and will refactor this
 * inline computation to call it.
 */
export const dynamic = 'force-dynamic';

interface MeResponse {
  role: 'guest' | 'user' | 'admin';
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  remaining: number | null;
  resetsAt: string | null;
}

/** Next 00:00 UTC as an ISO string. */
function nextResetAt(now: Date): string {
  const reset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return reset.toISOString();
}

/** Later of the current UTC midnight and the person's `allowance_reset_at`. */
function windowStart(now: Date, resetAt: string | null): Date {
  const utcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  if (!resetAt) return utcMidnight;
  const parsed = new Date(resetAt);
  return parsed > utcMidnight ? parsed : utcMidnight;
}

interface UsageCountRow {
  used: string;
}

export async function GET(): Promise<NextResponse<MeResponse>> {
  const now = new Date();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({
      role: 'guest',
      name: null,
      email: null,
      imageUrl: null,
      remaining: null,
      resetsAt: null,
    });
  }

  if (user.role === ROLE_ADMIN) {
    return NextResponse.json({
      role: 'admin',
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
      remaining: null,
      resetsAt: nextResetAt(now),
    });
  }

  const start = windowStart(now, user.allowanceResetAt);
  const rows = await query<UsageCountRow>(
    `select count(*)::text as used
     from public.forecast_usage
     where user_id = $1 and created_at >= $2`,
    [user.id, start.toISOString()],
  );
  const used = Number(rows[0]?.used ?? '0');
  const remaining = Math.max(DAILY_FORECAST_ALLOWANCE - used, 0);

  return NextResponse.json({
    role: 'user',
    name: user.name,
    email: user.email,
    imageUrl: user.imageUrl,
    remaining,
    resetsAt: nextResetAt(now),
  });
}
