import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/authorize';
import { query } from '@/lib/db/client';

/**
 * `GET /api/admin/users` — the administration list (spec 022 §2.4).
 *
 * `requireAdmin()` is the authorization boundary here, not the middleware:
 * 401 for a guest, 403 for a signed-in non-admin.
 *
 * `forecastsToday` is the count of `forecast_usage` rows since the person's
 * current allowance-window start — the later of the current UTC midnight and
 * their `allowance_reset_at` — computed in one query with a filtered count.
 */
export const dynamic = 'force-dynamic';

interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  created_at: string;
  forecasts_today: string;
}

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  forecastsToday: number;
}

const USERS_QUERY = `
  select
    u.id,
    u.name,
    u.email,
    u.role,
    u.created_at,
    count(f.id) filter (
      where f.created_at >= greatest(
        date_trunc('day', now() at time zone 'UTC') at time zone 'UTC',
        coalesce(u.allowance_reset_at, to_timestamp(0))
      )
    )::text as forecasts_today
  from public.users u
  left join public.forecast_usage f on f.user_id = u.id
  group by u.id
  order by u.created_at asc
`;

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === 'forbidden' ? 'Admin access required' : 'Sign in required' },
      { status: auth.status },
    );
  }

  try {
    const rows = await query<AdminUserRow>(USERS_QUERY);
    const users: AdminUser[] = rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      forecastsToday: Number(row.forecasts_today ?? '0'),
    }));
    return NextResponse.json(users);
  } catch (error: unknown) {
    console.error('[admin/users] query failed:', error);
    return NextResponse.json({ error: 'Could not read the user list' }, { status: 503 });
  }
}
