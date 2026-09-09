/**
 * Pure helpers behind the optional `?ids=` parameter of `GET /api/markets`
 * (spec 021, technical-considerations §2.1). Kept in a colocated module so the
 * route handler imports them and they stay unit-testable without a server
 * (`src/scripts/watchlist.test.ts`).
 */

import { WATCHLIST_MAX_COINS } from '@/consts/prices';
import type { MarketListItem } from '@/data/types';

export type ParseMarketIdsResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Normalise a raw `ids` query string: split on comma, trim, lowercase,
 * de-duplicate (first occurrence wins), drop empties. Rejects a list longer
 * than `WATCHLIST_MAX_COINS` — the URL is user-controllable and must not be a
 * way to fan out an arbitrarily large upstream request.
 */
export function parseMarketIds(raw: string): ParseMarketIdsResult {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase();
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (ids.length > WATCHLIST_MAX_COINS) {
    return {
      ok: false,
      error: `Too many ids: ${ids.length} (max ${WATCHLIST_MAX_COINS})`,
    };
  }

  return { ok: true, ids };
}

/**
 * Re-order `rows` to match `requestedIds`. An id with no matching row (unknown
 * or delisted coin CoinGecko did not return) is simply absent — never
 * synthesised as a row of zeroes (functional spec 2.7). Rows whose id was not
 * requested are dropped.
 */
export function orderByRequestedIds(
  rows: readonly MarketListItem[],
  requestedIds: readonly string[],
): MarketListItem[] {
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  const ordered: MarketListItem[] = [];

  for (const id of requestedIds) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }

  return ordered;
}
