/**
 * News ingest collector (spec 015, Slice 3; rewired off rss2json in spec 023,
 * Slice 5).
 *
 * Fetches each feed in `RSS_FEEDS` directly — its own RSS/Atom XML, no
 * third-party bridge — keeps the fields this spec needs (title, canonical
 * URL, source, publication time, raw item), drops anything older than
 * `NEWS_INGEST_WINDOW_HOURS`, and returns the de-duplicated set alongside a
 * per-feed `SourceStatus`.
 *
 * `https://api.rss2json.com/v1/api.json` sat in front of all three feeds as a
 * single point of failure; it started returning `HTTP 422` for every feed
 * while the feeds themselves stayed healthy (spec 023 §2.6). `RSS_FEEDS`
 * already holds each feed's own endpoint (rss2json only wrapped it in a query
 * param), so removing the bridge is a fetch-and-parse change, not a new URL
 * list.
 *
 * All three configured feeds (`src/consts/news.ts`) are RSS 2.0
 * (`<item>`/`<link>text</link>`/`<pubDate>` in RFC-822). `parseFeedXml` also
 * understands Atom (`<entry>`/`<link href="...">`/`<published>`/`<updated>`)
 * and Dublin Core `<dc:date>`,
 * so a future feed addition does not silently drop every item.
 *
 * Discipline, deliberately unlike `src/lib/marketData.ts`:
 *   - A feed that fails contributes NOTHING — no placeholder string, ever. The
 *     failure is one `SourceStatus` entry (`news:<source>`, ok:false).
 *   - One feed failing never affects the others (Promise.allSettled).
 *   - URL normalisation before hashing, so the same article under two campaign
 *     tags collapses to one row and is classified — and paid for — once.
 *   - A date that cannot be parsed rejects the item; it never falls back to
 *     `now()` (functional-spec 2.6). `publishNews` computes ageing and expiry
 *     from `published_at`, so a wrong date would put a stale headline inside
 *     the impact horizon.
 *
 * Persistence lives in `src/lib/db/news.ts`; wiring into `/api/collect` is in
 * that route. Nothing here touches the database.
 */

import { createHash } from 'node:crypto';

import { NEWS_INGEST_WINDOW_HOURS, RSS_FEED_SOURCES, RSS_FEEDS } from '@/consts/news';
import type { SourceStatus } from '@/data/types';

const HOUR_MS = 3_600_000;

/** Sent on every feed fetch — some feed hosts 403 requests with no UA at all. */
const FEED_FETCH_USER_AGENT = 'CatoshiDashboard/1.0 (+news ingest; no bridge)';

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
  /** ISO 8601, from the feed's own publication date — never ingest time. */
  publishedAt: string;
  /** The feed item as received, for fields not yet typed. */
  raw: unknown;
}

export interface NewsIngestResult {
  items: IngestedNewsItem[];
  sources: SourceStatus[];
}

/** One RSS `<item>` or Atom `<entry>`, reduced to the fields this pipeline uses. */
export interface FeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Minimal XML extraction. Deliberately not a general-purpose XML parser: RSS
// and Atom feed items are shallow and well-formed in practice, and a narrow
// regex extractor avoids a dependency for three known feeds. It reads text
// content, one CDATA unwrap, and the standard named-entity escapes.
// ---------------------------------------------------------------------------

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

/** Trims, unwraps a single `<![CDATA[...]]>` wrapper if present, decodes entities. */
function cleanText(raw: string): string {
  const trimmed = raw.trim();
  const cdataMatch = trimmed.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  const inner = cdataMatch ? cdataMatch[1] : trimmed;
  return decodeXmlEntities(inner).trim();
}

/** First non-empty text content of any of `tagNames`, in order. */
function extractTagText(block: string, tagNames: string[]): string | undefined {
  for (const tag of tagNames) {
    const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) {
      const text = cleanText(match[1]);
      if (text) return text;
    }
  }
  return undefined;
}

/**
 * RSS `<link>` is plain text content; Atom `<link>` is (usually self-closing)
 * with the URL in `href` and the preferred one marked `rel="alternate"` (or no
 * `rel` at all, which defaults to alternate). Tries RSS's shape first, then
 * Atom's.
 */
function extractLink(block: string): string | undefined {
  const rssMatch = block.match(/<link>([^<]+)<\/link>/i);
  if (rssMatch) {
    const text = cleanText(rssMatch[1]);
    if (text) return text;
  }

  const atomLinkRegex = /<link\b([^>]*)\/?>/gi;
  let fallback: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = atomLinkRegex.exec(block)) !== null) {
    const hrefMatch = match[1].match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const relMatch = match[1].match(/rel=["']([^"']+)["']/i);
    const rel = relMatch ? relMatch[1] : 'alternate';
    const href = cleanText(hrefMatch[1]);
    if (rel === 'alternate') return href;
    fallback ??= href;
  }
  return fallback;
}

/** Every well-formed `<tagName>...</tagName>` block, non-overlapping. */
function extractBlocks(xml: string, tagName: string): string[] {
  return xml.match(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'gi')) ?? [];
}

/**
 * Parses raw feed XML (RSS 2.0 `<item>` or Atom `<entry>`) into `FeedItem`s.
 * Pure, exported for testing. A feed with neither tag, or XML so malformed
 * that no blocks match, yields an empty array — the caller treats that as a
 * failed fetch, the same as a network error.
 */
export function parseFeedXml(xml: string): FeedItem[] {
  const blocks = [...extractBlocks(xml, 'item'), ...extractBlocks(xml, 'entry')];
  return blocks.map((block) => ({
    title: extractTagText(block, ['title']),
    link: extractLink(block),
    // `dc:date` (Dublin Core, ISO-8601) is the only date some RSS feeds carry —
    // RSS 1.0/RDF has no `<pubDate>` at all, and a few RSS 2.0 feeds emit
    // `<dc:date>` alongside or instead of it. Without it those items lose their
    // date, `parsePubDate` returns null and `toIngestedItem` drops every one of
    // them — the feed then reports as failed with nothing to show for it.
    // Ordered publish-date-first: `updated` is a revision time, so it is the
    // last resort, never preferred over a real publication date.
    pubDate: extractTagText(block, ['pubDate', 'published', 'dc:date', 'updated']),
  }));
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

/**
 * Parses a feed's own publication date: RFC-822 (RSS, e.g.
 * `"Mon, 01 Sep 2026 13:45:00 +0000"`) or ISO-8601 (Atom). `Date`'s built-in
 * parser accepts both natively. Returns `null` — never a "now" fallback — when
 * the string is empty or unparseable; the caller drops the item
 * (functional-spec 2.6).
 */
export function parsePubDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Maps one raw feed item to an `IngestedNewsItem`, or `null` if it is
 * unusable: missing title / link / date, an unparseable date or URL, or older
 * than the ingest window. Pure, exported for testing.
 */
export function toIngestedItem(
  raw: FeedItem,
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
  if (!published || !isWithinIngestWindow(published, now)) {
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

/**
 * Fetches and parses one feed directly from its own endpoint. Throws on any
 * non-ok response, or when the body yields zero `<item>`/`<entry>` blocks — a
 * real feed is never actually empty, so zero parsed items means the XML was
 * malformed or the shape was unrecognised, and that must be reported as a
 * failure, not a silent empty success.
 */
async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': FEED_FETCH_USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
  });
  if (!res.ok) {
    throw new Error(`feed HTTP ${res.status} for ${feedUrl}`);
  }
  const xml = await res.text();
  const items = parseFeedXml(xml);
  if (items.length === 0) {
    throw new Error(`no items parsed (malformed or unrecognised XML) for ${feedUrl}`);
  }
  return items;
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
