import { NextResponse } from 'next/server';

import { ROLE_ADMIN, ROLE_USER } from '@/consts/auth';
import { requireAdmin } from '@/lib/auth/authorize';
import { query } from '@/lib/db/client';

/**
 * `PATCH /api/admin/users/[id]/role` — change a person between user and admin
 * (spec 022 §2.4).
 *
 * `requireAdmin()` is the authorization boundary. Returns **409** when the
 * caller targets their own row with `role: 'user'`, so the product can never
 * be left with no admin.
 */
export const dynamic = 'force-dynamic';

interface RoleRequestBody {
  role?: unknown;
}

interface UpdatedRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  created_at: string;
}

export async function PATCH(
  request: Request,
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

  let body: RoleRequestBody = {};
  try {
    body = (await request.json()) as RoleRequestBody;
  } catch {
    // fall through to validation below
  }

  const role = body.role;
  if (role !== ROLE_USER && role !== ROLE_ADMIN) {
    return NextResponse.json(
      { error: `role must be '${ROLE_USER}' or '${ROLE_ADMIN}'` },
      { status: 400 },
    );
  }

  if (targetId === auth.user.id && role === ROLE_USER) {
    return NextResponse.json(
      { error: 'An admin cannot remove their own access.' },
      { status: 409 },
    );
  }

  try {
    const rows = await query<UpdatedRow>(
      `update public.users set role = $1 where id = $2
       returning id, name, email, role, created_at`,
      [role, targetId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    });
  } catch (error: unknown) {
    console.error('[admin/users/role] update failed:', error);
    return NextResponse.json({ error: 'Could not update the role' }, { status: 503 });
  }
}
