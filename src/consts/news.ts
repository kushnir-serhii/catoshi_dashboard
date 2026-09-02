/**
 * News Impact Classification (spec 015) — shared constants.
 *
 * Per the CLAUDE.md constants rule, every value the ingest and classification
 * pipeline uses in more than one file lives here. Slices 1–3 use only the feed
 * list, the ingest window, the horizon bounds and the severity map; the
 * classification knobs (batch/cap/interval/model/prompt) are wired in Slice 4.
 */

/**
 * RSS feeds ingested for news. Moved here from `src/lib/marketData.ts`
 * (spec 015, Slice 2) so the forecast-prompt headline fetch and the news
 * collector read one list. A fourth feed is a one-line addition here.
 */
export const RSS_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
  'https://decrypt.co/feed',
] as const;

/**
 * Short source label per feed URL. Used as the `news_items.source` value and,
 * prefixed with `news:`, as the per-feed `SourceStatus.source` in a collection
 * run (e.g. `news:coindesk`).
 */
export const RSS_FEED_SOURCES: Record<string, string> = {
  'https://www.coindesk.com/arc/outboundfeeds/rss/': 'coindesk',
  'https://cointelegraph.com/rss': 'cointelegraph',
  'https://decrypt.co/feed': 'decrypt',
};

/**
 * Articles whose `published_at` is older than this at ingest are dropped —
 * not stored, not classified. 48h covers a weekend gap in collection while
 * keeping the feed about genuinely current events.
 */
export const NEWS_INGEST_WINDOW_HOURS = 48;

/**
 * Unclassified items folded into one LLM call. Batching is what makes the
 * system prompt cacheable and keeps the bill near the ~$1/month allowance.
 */
export const NEWS_CLASSIFY_BATCH_SIZE = 10;

/**
 * Hard ceiling on items classified per collection run. The remainder defers to
 * the next run — an unbounded backlog must never become an unbounded bill.
 */
export const NEWS_CLASSIFY_MAX_PER_RUN = 20;

/**
 * Classification runs at most this often, not every hourly collection run.
 * News does not arrive fast enough to justify hourly paid calls.
 */
export const NEWS_CLASSIFY_INTERVAL_HOURS = 6;

/**
 * Version tag on every classification row. Bumped on any edit to the
 * classification system prompt, so a prompt change is visible in the record
 * and re-classification inserts rather than overwrites (functional-spec 2.4).
 */
export const NEWS_PROMPT_VERSION = 'news-v1';

/**
 * Cheap-tier model for classification. Matches the Haiku id in
 * `ALLOWED_FORECAST_MODELS.claude` (`src/consts/projections.ts`) so the
 * project keeps one model vocabulary.
 */
export const NEWS_CLASSIFY_MODEL = 'claude-haiku-4-5-20251001';

/**
 * magnitude band → fixed severity point in 0..1, governing card ordering
 * across both signal kinds. Chosen to interleave sensibly with the
 * market-state scale (rules emit ~0..1 by distance past their threshold, with
 * a fixed 0.5 for rules that have no natural scale — `SEVERITY_FIXED_MID` in
 * `src/consts/signals.ts`):
 *   - HIGH (0.8) outranks most rule firings — a real catalyst leads the feed.
 *   - MEDIUM (0.5) sits alongside the no-natural-scale rules.
 *   - LOW (0.25) sinks below any active market-state signal.
 */
export const NEWS_MAGNITUDE_SEVERITY: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.8,
};

/**
 * Allowed range for an asserted `horizon_hours`. A classification outside
 * these bounds is dropped without being written (validation, Slice 4).
 *   - 6h floor: below this the resolution job cannot find a clean price gap.
 *   - 720h (30d) ceiling: past a month a single headline is not a falsifiable
 *     driver of price.
 */
export const NEWS_HORIZON_HOURS_MIN = 6;
export const NEWS_HORIZON_HOURS_MAX = 720;
