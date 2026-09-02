/**
 * Pure helpers shared by the news publish path (`src/lib/news/publish.ts`),
 * the `/api/signals` read path and the Signals page's client-side scope
 * filter. No database, no network — unit-tested directly in
 * `src/scripts/news-publish.test.ts`.
 */

import { NEWS_MAGNITUDE_SEVERITY } from '@/consts/news';
import type { NewsScope } from '@/data/types';

export type NewsMagnitude = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Expiry instant of a news signal: `published_at + horizon_hours`, as an
 * absolute duration. Deliberately epoch-ms arithmetic, not calendar math, so
 * the result is the same instant regardless of any DST transition the wall
 * clock crosses in between — matching Postgres `timestamptz + interval`.
 *
 * Ageing and expiry both hang off `published_at` (the article's own time),
 * never `classified_at` and never `now()` — the defect spec 014 already fixed
 * once for market-state signals (`decisions.md` §3, instance 2).
 */
export function newsSignalExpiry(publishedAt: string | Date, horizonHours: number): Date {
  const publishedMs =
    publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
  return new Date(publishedMs + horizonHours * 3_600_000);
}

/** magnitude band → fixed severity point in 0..1 (governs cross-kind card ordering). */
export function newsSignalSeverity(magnitude: NewsMagnitude): number {
  return NEWS_MAGNITUDE_SEVERITY[magnitude];
}

/**
 * A news row is live while its expiry is strictly in the future. At or past
 * expiry it leaves the live feed but stays in the table for scoring
 * (functional-spec 2.3).
 */
export function isNewsLive(expiresAt: string | Date, now: number | Date = Date.now()): boolean {
  const expiresMs = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return expiresMs > nowMs;
}

/** The Signals-page filter control: everything, market-wide only, or one asset. */
export type NewsScopeFilter = 'all' | NewsScope;

/**
 * Applies the scope filter to a list of news signals:
 *   - `all`    → unchanged
 *   - `market` → only market-wide items (no per-asset news)
 *   - `BTC` / `ETH` / `SOL` → only that asset's news (never market-wide)
 *
 * The same reading the `/api/signals?scope=` param uses server-side, kept here
 * as one pure function so the two cannot disagree.
 */
export function filterNewsByScope<T extends { scope: NewsScope }>(
  items: readonly T[],
  filter: NewsScopeFilter,
): T[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.scope === filter);
}

/** Newest `publishedAt` among the items as an ISO string, or null when empty. */
export function newestNewsPublishedAt(items: readonly { publishedAt: string }[]): string | null {
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const ms = new Date(item.publishedAt).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) bestMs = ms;
  }
  return bestMs === Number.NEGATIVE_INFINITY ? null : new Date(bestMs).toISOString();
}
