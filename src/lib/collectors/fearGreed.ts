/**
 * Fear & Greed index collector (market-wide, not per-asset).
 *
 * Resolves to `null` on any non-200 response, network failure, or
 * unexpected payload shape — never throws. Per technical-considerations.md
 * §2.3, this is a missing field, not a run failure.
 */

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=30';

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
