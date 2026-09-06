import { matchesAdminSecret } from '@/lib/adminAuth';

const AUTH_PREFIX = 'Bearer ';

/**
 * Three-way because the scheduled-forecast routes have two distinct failure
 * shapes: an unset `FORECAST_INGEST_SECRET` is a deploy misconfiguration
 * (503, never open), while a missing/wrong credential against a configured
 * secret is a rejected request (401).
 */
export type IngestAuthResult = 'ok' | 'unauthorized' | 'unconfigured';

/**
 * Credential check for the machine-to-machine scheduled-forecast routes
 * (spec 020): `GET /api/projections/inputs` and `POST /api/projections/ingest`.
 *
 * Mirrors `checkAdminAuth` (spec 019, technical-considerations §2.4) but:
 * - a **separate** secret, `FORECAST_INGEST_SECRET` — it lives in a scheduled
 *   task's prompt configuration, a different blast radius from the operator's
 *   browser cookie;
 * - `Authorization: Bearer` only, no cookie path — these routes are never
 *   called from a browser.
 *
 * Uses the same `crypto.timingSafeEqual` comparison via `matchesAdminSecret`.
 */
export function checkIngestAuth(request: Request): IngestAuthResult {
  const expected = process.env.FORECAST_INGEST_SECRET;
  if (!expected) {
    return 'unconfigured';
  }

  const header = request.headers.get('authorization');
  if (header && header.startsWith(AUTH_PREFIX)) {
    const provided = header.slice(AUTH_PREFIX.length);
    if (matchesAdminSecret(expected, provided)) {
      return 'ok';
    }
  }

  return 'unauthorized';
}
