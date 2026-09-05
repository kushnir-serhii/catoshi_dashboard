import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ADMIN_COOKIE_NAME } from '@/consts/projections';
import { matchesAdminSecret } from '@/lib/adminAuth';

/** 30 days, in seconds — matches `checkAdminAuth`'s cookie lifetime
 * expectation in `src/app/api/projections/refresh/route.ts` (spec 019,
 * Slice 3, technical-considerations §2.4). */
const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * `GET /api/admin/unlock?key=<ADMIN_SECRET>` — no page, no form, a URL the
 * operator visits once to set the `catoshi_admin` HttpOnly cookie that
 * `POST /api/projections/refresh`'s `checkAdminAuth` later reads. An empty
 * (or missing) `key` clears the cookie instead. A non-empty `key` that
 * doesn't match `ADMIN_SECRET` never sets or refreshes the cookie — the
 * response never claims to have unlocked anything it didn't.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const cookieStore = await cookies();

  if (key.length === 0) {
    cookieStore.delete(ADMIN_COOKIE_NAME);
    return NextResponse.json({ status: 'cleared' });
  }

  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    // Nothing valid to unlock — mirrors checkAdminAuth's 'unconfigured'
    // case. Setting a cookie here could never authenticate later, so don't
    // pretend to succeed.
    return NextResponse.json({ status: 'unconfigured' }, { status: 503 });
  }

  if (!matchesAdminSecret(expected, key)) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  cookieStore.set(ADMIN_COOKIE_NAME, key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
  return NextResponse.json({ status: 'unlocked' });
}
