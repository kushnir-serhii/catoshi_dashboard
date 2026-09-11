import { timingSafeEqual } from 'crypto';

/**
 * Timing-safe comparison of a provided credential against an expected
 * secret. Guards the length check first — `timingSafeEqual` throws on
 * mismatched-length buffers, and the length itself isn't sensitive, only
 * which characters matched is. Since spec 022 retired `ADMIN_SECRET` and the
 * admin unlock route, `matchesAdminSecret` is used only by `checkIngestAuth` in
 * `src/lib/ingestAuth.ts` (the `FORECAST_INGEST_SECRET` machine-to-machine
 * check). `/api/collect`'s `isAuthorized` guards a different secret
 * (`CRON_SECRET`, header-only, no cookie) and is left as its own copy rather
 * than forced onto this shape.
 */
export function matchesAdminSecret(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
