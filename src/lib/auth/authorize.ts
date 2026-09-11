import { ROLE_ADMIN } from '@/consts/auth';
import { type CurrentUser, getCurrentUser } from '@/lib/auth/session';

/**
 * The two guards every identity-protected Route Handler uses (spec 022 §2.5).
 *
 * Returns a typed refusal rather than throwing, so each route stays responsible
 * for its own status code and message — mirroring the `IngestAuthResult`
 * three-way pattern in `src/lib/ingestAuth.ts`.
 *
 * Server-only: `getCurrentUser()` reads the Auth.js session cookie and queries
 * Postgres.
 */

export type RequireUserResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; status: 401; reason: 'signin-required' };

export type RequireAdminResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; status: 401; reason: 'signin-required' }
  | { ok: false; status: 403; reason: 'forbidden' };

/** Any signed-in person passes; a guest gets a typed 401. */
export async function requireUser(): Promise<RequireUserResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, reason: 'signin-required' };
  }
  return { ok: true, user };
}

/** Only an admin passes; a guest gets 401, a signed-in non-admin gets 403. */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, reason: 'signin-required' };
  }
  if (user.role !== ROLE_ADMIN) {
    return { ok: false, status: 403, reason: 'forbidden' };
  }
  return { ok: true, user };
}
