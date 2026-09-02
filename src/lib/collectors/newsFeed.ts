/**
 * News ingest collector (spec 015, Slice 3) — no model in sight.
 *
 * Fetches each RSS feed in `RSS_FEEDS` through the rss2json bridge, keeps the
 * fields this spec needs (title, canonical URL, source, publication time, raw
 * item), drops anything older than `NEWS_INGEST_WINDOW_HOURS`, and returns the
 * de-duplicated set alongside a per-feed `SourceStatus`.
 *
 * Discipline, deliberately unlike `src/lib/marketData.ts`:
 *   - A feed that fails contributes NOTHING — no placeholder string, ever. The
 *     failure is one `SourceStatus` entry (`news:<source>`, ok:false).
 *   - One feed failing never affects the others (Promise.allSettled).
 *   - URL normalisation before hashing, so the same article under two campaign
 *     tags collapses to one row and is classified — and paid for — once.
 *
 * Persistence lives in `src/lib/db/news.ts`; wiring into `/api/collect` is in
 * that route. Nothing here touches the database.
 */

import { createHash } from 'node:crypto';

import { NEWS_INGEST_WINDOW_HOURS, RSS_FEED_SOURCES, RSS_FEEDS } from '@/consts/news';
import type { SourceStatus } from '@/data/types';

const HOUR_MS = 3_600_000;

/** rss2json endpoint and how many items to pull per feed. */
const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json';
const RSS_ITEM_COUNT = 25;

/**
 * Query parameters stripped during normalisation: every `utm_*`, plus the
 * common single-name trackers. Anything else is kept (sorted) so a genuine
 * content parameter still distinguishes two articles.
 */
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid', 'igshid']);

export interface IngestedNewsItem {
  urlHash: string;
  /** The canonical (normalised) URL — what gets stored and linked. */
  url: string;
  title: string;
  source: string;
  feedUrl: string;
  /** ISO 8601, from the feed's pubDate — never ingest time. */
  publishedAt: string;
  /** The feed item as received, for fields not yet typed. */
  raw: unknown;
}

export interface NewsIngestResult {
  items: IngestedNewsItem[];
  sources: SourceStatus[];
}

interface Rss2JsonItem {
  title?: string;
  link?: string;
  pubDate?: string;
  [key: string]: unknown;
}

interface Rss2JsonResponse {
  status?: string;
  items?: Rss2JsonItem[];
}

/**
 * Canonicalises a URL for de-duplication (pure, exported for testing):
 * lowercase host and scheme, drop the fragment, strip `utm_*` and common
 * tracking params, sort the remaining query, drop a trailing slash. Two
 * spellings of one article produce one output — and therefore one hash.
 *
 * Throws (via `new URL`) on an unparseable input; the caller treats that as
 * "skip this item".
 */
export function normalizeUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());

  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  const kept: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      continue;
    }
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  parsed.search = '';
  for (const [key, value] of kept) {
    parsed.searchParams.append(key, value);
  }

  // Drop a trailing slash on the path (but keep the URL valid for bare hosts):
  // ".../path/" -> ".../path", "https://host/" -> "https://host".
  return parsed.toString().replace(/\/(\?|#|$)/, '$1');
}

/** sha256 hex of a normalised URL. */
export function hashUrl(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

/**
 * True when `publishedAt` is no older than `NEWS_INGEST_WINDOW_HOURS` relative
 * to `now`. Future-dated items (feed clock skew) are kept.
 */
export function isWithinIngestWindow(publishedAt: Date, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - publishedAt.getTime();
  return ageMs <= NEWS_INGEST_WINDOW_HOURS * HOUR_MS;
}

/** Parses an rss2json pubDate ("2026-09-01 13:45:00", UTC) into a Date. */
function parsePubDate(pubDate: string): Date {
  const normalized = /[TZ]|[+-]\d{2}:?\d{2}$/.test(pubDate)
    ? pubDate
    : `${pubDate.trim().replace(' ', 'T')}Z`;
  return new Date(normalized);
}

/**
 * Maps one raw feed item to an `IngestedNewsItem`, or `null` if it is
 * unusable: missing title / link / date, an unparseable date or URL, or older
 * than the ingest window. Pure, exported for testing.
 */
export function toIngestedItem(
  raw: Rss2JsonItem,
  feedUrl: string,
  now: Date = new Date(),
): IngestedNewsItem | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const link = typeof raw.link === 'string' ? raw.link.trim() : '';
  const pubDate = typeof raw.pubDate === 'string' ? raw.pubDate.trim() : '';
  if (!title || !link || !pubDate) {
    return null;
  }

  const published = parsePubDate(pubDate);
  if (Number.isNaN(published.getTime()) || !isWithinIngestWindow(published, now)) {
    return null;
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(link);
  } catch {
    return null;
  }

  return {
    urlHash: hashUrl(normalizedUrl),
    url: normalizedUrl,
    title,
    source: RSS_FEED_SOURCES[feedUrl] ?? new URL(feedUrl).hostname,
    feedUrl,
    publishedAt: published.toISOString(),
    raw,
  };
}

/** Fetches and parses one feed. Throws on any non-ok / malformed response. */
async function fetchFeed(feedUrl: string): Promise<Rss2JsonItem[]> {
  const endpoint = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(feedUrl)}&count=${RSS_ITEM_COUNT}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`rss2json HTTP ${res.status} for ${feedUrl}`);
  }
  const body = (await res.json()) as Rss2JsonResponse;
  if (body.status && body.status !== 'ok') {
    throw new Error(`rss2json status "${body.status}" for ${feedUrl}`);
  }
  if (!Array.isArray(body.items)) {
    throw new Error(`rss2json returned no items array for ${feedUrl}`);
  }
  return body.items;
}

/**
 * Fetches every feed in `RSS_FEEDS` and returns the de-duplicated, in-window
 * article set plus a `SourceStatus` per feed. A failed feed yields zero items
 * and one `{ ok: false }` status; it never throws and never blocks the others.
 */
export async function collectNewsFeeds(now: Date = new Date()): Promise<NewsIngestResult> {
  const settled = await Promise.allSettled(RSS_FEEDS.map((feedUrl) => fetchFeed(feedUrl)));

  const items: IngestedNewsItem[] = [];
  const sources: SourceStatus[] = [];
  const seenHashes = new Set<string>();

  settled.forEach((result, index) => {
    const feedUrl = RSS_FEEDS[index];
    const sourceName = `news:${RSS_FEED_SOURCES[feedUrl] ?? 'feed'}`;

    if (result.status === 'rejected') {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sources.push({ source: sourceName, ok: false, error });
      return;
    }

    for (const raw of result.value) {
      const item = toIngestedItem(raw, feedUrl, now);
      if (!item || seenHashes.has(item.urlHash)) {
        continue;
      }
      seenHashes.add(item.urlHash);
      items.push(item);
    }
    sources.push({ source: sourceName, ok: true });
  });

  return { items, sources };
}
