import { NextResponse } from 'next/server';

import { DAILY_FORECAST_ALLOWANCE, ROLE_ADMIN } from '@/consts/auth';
import { requireAdmin } from '@/lib/auth/authorize';
import { query } from '@/lib/db/client';

/**
 * `POST /api/admin/users/[id]/allowance` — restore a person's reforecast
 * allowance for the current UTC day (spec 022 §2.4 / §2.8).
 *
 * `requireAdmin()` is the authorization boundary: 401 for a guest, 403 for a
 * signed-in non-admin. The restore is a single write of
 * `allowance_reset_at = now()`; the `forecast_usage` ledger keeps the full spend
 * history. After the restore the person's window starts at `now`, so
 * `forecastsToday` within the new window is 0 and `remaining` is the full
 * `DAILY_FORECAST_ALLOWANCE` (or `null` when the target is an admin).
 */
export const dynamic = 'force-dynamic';

interface RestoredRow {
  id: string;
  role: string;
  forecasts_today: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === 'forbidden' ? 'Admin access required' : 'Sign in required' },
      { status: auth.status },
    );
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const rows = await query<RestoredRow>(
      `update public.users
          set allowance_reset_at = now()
        where id = $1
      returning
        id,
        role,
        (
          select count(*)
            from public.forecast_usage f
           where f.user_id = public.users.id
             and f.created_at >= public.users.allowance_reset_at
        )::text as forecasts_today`,
      [targetId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const forecastsToday = Number(row.forecasts_today ?? '0');
    const remaining =
      row.role === ROLE_ADMIN ? null : Math.max(0, DAILY_FORECAST_ALLOWANCE - forecastsToday);

    return NextResponse.json({ remaining, forecastsToday });
  } catch (error: unknown) {
    console.error('[admin/users/allowance] restore failed:', error);
    return NextResponse.json({ error: 'Could not restore the allowance' }, { status: 503 });
  }
}
