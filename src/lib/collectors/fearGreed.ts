/**
 * Fear & Greed index collector (market-wide, not per-asset).
 *
 * Resolves to `null` on any non-200 response, network failure, or
 * unexpected payload shape — never throws. Per technical-considerations.md
 * §2.3, this is a missing field, not a run failure.
 */

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=30';

/**
 * Full published history of the index, oldest reading 01.02.2018. `limit=0`
 * means "all rows" (spec 013, history backfill).
 */
const FEAR_GREED_HISTORY_URL = 'https://api.alternative.me/fng/?limit=0&format=json';

/**
 * The feed is ordered most-recent-first with one entry per calendar day
 * (verified against the live response: consecutive `timestamp` values are
 * exactly 86400 seconds apart), so the entry 7 days prior to the current
 * one sits at index 7.
 */
const SEVEN_DAYS_AGO_INDEX = 7;

interface FearGreedEntry {
  value: string;
  value_classification: string;
  timestamp: string;
}

interface FearGreedResponse {
  data: FearGreedEntry[];
}

function isFearGreedEntry(value: unknown): value is FearGreedEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { value?: unknown }).value === 'string'
  );
}

function isFearGreedResponse(value: unknown): value is FearGreedResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { data?: unknown }).data) &&
    (value as { data: unknown[] }).data.every(isFearGreedEntry)
  );
}

/**
 * Current Fear & Greed index value plus the value from roughly 7 days ago.
 *
 * Method: `GET api.alternative.me/fng/?limit=30` returns entries
 * most-recent-first, one per day. `data[0].value` is the current reading;
 * `data[7].value` is ~7 days ago. If the feed has fewer than 8 entries,
 * `value7dAgo` is `null` while `value` is still returned.
 */
export async function fetchFearGreed(): Promise<{
  value: number;
  value7dAgo: number | null;
} | null> {
  try {
    const res = await fetch(FEAR_GREED_URL);
    if (!res.ok) {
      return null;
    }
    const body: unknown = await res.json();
    if (!isFearGreedResponse(body) || body.data.length === 0) {
      return null;
    }

    const value = Number(body.data[0].value);
    if (!Number.isFinite(value)) {
      return null;
    }

    let value7dAgo: number | null = null;
    if (body.data.length > SEVEN_DAYS_AGO_INDEX) {
      const parsed = Number(body.data[SEVEN_DAYS_AGO_INDEX].value);
      value7dAgo = Number.isFinite(parsed) ? parsed : null;
    }

    return { value, value7dAgo };
  } catch {
    return null;
  }
}

/**
 * UTC calendar date (`YYYY-MM-DD`) of a Fear & Greed entry, whose `timestamp`
 * is whole seconds since the epoch marking `00:00:00Z` of that day.
 */
function utcDateKey(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * The entire published Fear & Greed series as a date-indexed map — key is the
 * UTC calendar date (`YYYY-MM-DD`), value is that day's numeric index reading.
 *
 * Method: `GET api.alternative.me/fng/?limit=0` returns every daily entry ever
 * published (from 01.02.2018). Entries with a non-finite value are dropped.
 * Resolves to `null` on any non-200, network failure or unexpected payload
 * shape — never throws (technical-considerations.md §2.3).
 */
export async function fetchFearGreedHistory(): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(FEAR_GREED_HISTORY_URL);
    if (!res.ok) {
      return null;
    }
    const body: unknown = await res.json();
    if (!isFearGreedResponse(body) || body.data.length === 0) {
      return null;
    }

    const byDate = new Map<string, number>();
    for (const entry of body.data) {
      const value = Number(entry.value);
      const timestamp = Number(entry.timestamp);
      if (!Number.isFinite(value) || !Number.isFinite(timestamp)) {
        continue;
      }
      byDate.set(utcDateKey(timestamp), value);
    }

    return byDate.size > 0 ? byDate : null;
  } catch {
    return null;
  }
}
