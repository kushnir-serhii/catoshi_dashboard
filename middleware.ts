import { type NextRequest, NextResponse } from 'next/server';

import { ADMIN_PATH } from '@/consts/auth';

/**
 * Route protection for the admin area (spec 022 §2.7).
 *
 * NOT the authorization boundary — middleware cannot read Postgres, so it
 * cannot know a role. The real check is `requireAdmin()` in the page's server
 * component and in every `/api/admin/*` handler. All this does is the cheap
 * cookie-presence check: a visitor with no Auth.js session cookie is bounced
 * into the Google sign-in flow with a callback URL back to `/admin`.
 */

export const config = { matcher: ['/admin/:path*'] };

const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'] as const;

export function middleware(request: NextRequest): NextResponse {
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/api/auth/signin', request.url);
  signInUrl.searchParams.set('callbackUrl', ADMIN_PATH);
  return NextResponse.redirect(signInUrl);
}
