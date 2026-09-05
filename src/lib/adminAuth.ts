import { timingSafeEqual } from 'crypto';

/**
 * Timing-safe comparison of a provided credential against an expected
 * secret. Guards the length check first — `timingSafeEqual` throws on
 * mismatched-length buffers, and the length itself isn't sensitive, only
 * which characters matched is. Shared by the admin-gated refresh route
 * (`src/app/api/projections/refresh/route.ts`) and the admin unlock route
 * (`src/app/api/admin/unlock/route.ts`), spec 019 Slice 3. `/api/collect`'s
 * `isAuthorized` guards a different secret (`CRON_SECRET`, header-only, no
 * cookie) and is left as its own copy rather than forced onto this shape.
 */
export function matchesAdminSecret(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
