// Server-only. This module reads the Auth.js session cookie and queries
// Postgres directly — it must never be imported into a client component.
import { auth } from '@/auth';
import type { Role } from '@/consts/auth';
import { query } from '@/lib/db/client';

/**
 * Server-only. Resolves the Auth.js session to the caller's `public.users` row,
 * or `null` when there is no valid session (a guest). One indexed read by
 * primary key.
 */

export interface CurrentUser {
  id: number;
  googleSub: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: Role;
  allowanceResetAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  image_url: string | null;
  role: Role;
  allowance_reset_at: string | null;
  created_at: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const appUserId = session?.appUserId;
  if (typeof appUserId !== 'number') {
    return null;
  }

  const rows = await query<UserRow>(
    `select id, google_sub, email, name, image_url, role, allowance_reset_at, created_at
     from public.users
     where id = $1`,
    [appUserId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    imageUrl: row.image_url,
    role: row.role,
    allowanceResetAt: row.allowance_reset_at,
    createdAt: row.created_at,
  };
}
