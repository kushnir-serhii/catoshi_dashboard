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
export const NEWS_PROMPT_VERSION = 'news-v3';

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

/**
 * Upper bound on `horizon_hours` per magnitude band (spec 027 functional 2.5.4):
 * a weak catalyst cannot assert a month-long impact. Stated to the model in the
 * classification prompt.
 */
export const NEWS_HORIZON_CAP_HOURS: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 72,
  MEDIUM: 336,
  HIGH: 720,
};

/**
 * `public.app_settings.key` under which the admin-toggled news-classification
 * pause is stored (spec 022 §2.9). A row value of `'true'` means paused,
 * `'false'` means running; when the row is ABSENT the pause falls back to
 * `NEWS_CLASSIFY_ENABLED` below.
 */
export const APP_SETTING_NEWS_PAUSE = 'news_classification_paused';

/**
 * Env-var fallback for the news-classification pause (the pre-spec-022
 * behaviour): unattended classification runs unless `NEWS_CLASSIFY_ENABLED`
 * is explicitly `'false'`. Consulted only when the `app_settings` row is
 * absent, so toggling the admin switch and then clearing it returns to exactly
 * this value.
 */
export const NEWS_CLASSIFY_ENABLED = process.env.NEWS_CLASSIFY_ENABLED !== 'false';

/**
 * Duplicate clustering (spec 027 technical 5.3). A new item joins an existing
 * item's cluster when the overlap coefficient (|A∩B| / min(|A|,|B|)) of their
 * normalised title token sets is at least this AND they share at least
 * `NEWS_CLUSTER_MIN_SHARED_ENTITIES` named entities.
 */
export const NEWS_CLUSTER_OVERLAP_MIN = 0.35;

/**
 * Direction-conflict guard: two titles never cluster when one contains a down
 * word and the other an up word ("breaks below" story vs "rebounds" story).
 * Matched as whole lowercase words of the raw title; an entry with a space is a
 * phrase matched as consecutive words ("breaks below").
 */
export const NEWS_CLUSTER_DOWN_WORDS: readonly string[] = [
  'drop',
  'drops',
  'dropped',
  'dropping',
  'fall',
  'falls',
  'fell',
  'falling',
  'plunge',
  'plunges',
  'plunged',
  'plunging',
  'slide',
  'slides',
  'slid',
  'sliding',
  'slip',
  'slips',
  'slipped',
  'dip',
  'dips',
  'dipped',
  'sink',
  'sinks',
  'sank',
  'breaks below',
];
export const NEWS_CLUSTER_UP_WORDS: readonly string[] = [
  'rebound',
  'rebounds',
  'rebounded',
  'rebounding',
  'rise',
  'rises',
  'rose',
  'rising',
  'risen',
  'surge',
  'surges',
  'surged',
  'surging',
  'rally',
  'rallies',
  'rallied',
  'rallying',
  'jump',
  'jumps',
  'jumped',
  'climb',
  'climbs',
  'climbed',
  'gain',
  'gains',
  'gained',
];

/**
 * Amount-mismatch guard: when both titles carry a dollar amount (or both a
 * percentage) and no amount in one is within this ratio of an amount in the
 * other, they are different events ($100M move vs $1B move) and never cluster.
 */
export const NEWS_CLUSTER_AMOUNT_MAX_RATIO = 2;

/**
 * A pre-colon segment of at most this many words is a series label ("Live
 * updates:", "Morning Minute:") and is ignored when comparing titles; a longer
 * one is content and kept.
 */
export const NEWS_CLUSTER_SERIES_PREFIX_MAX_WORDS = 4;

/** Named entities (ticker or capitalised token) two titles must share to cluster. */
export const NEWS_CLUSTER_MIN_SHARED_ENTITIES = 2;

/** Only items published within this window of the new item are cluster candidates. */
export const NEWS_CLUSTER_WINDOW_HOURS = 24;

/** Words dropped from titles before comparison; they carry no event identity. */
export const NEWS_CLUSTER_STOP_WORDS: readonly string[] = [
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'by',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'into',
  'over',
  'after',
  'amid',
  'than',
  'what',
  'how',
  'why',
  'here',
  's',
  'just',
  'new',
  'says',
  'could',
  'will',
  'may',
];

/**
 * Spelling variants folded to one canonical lowercase name before clustering
 * compares titles (keys are lowercase; multi-word keys match across spaces and
 * dots, "J.P. Morgan"). Canonical names here also count as named entities
 * whatever their case. Keep it small and explicit.
 */
export const NEWS_CLUSTER_ENTITY_ALIASES: Readonly<Record<string, string>> = {
  ether: 'ethereum',
  eth: 'ethereum',
  btc: 'bitcoin',
  sol: 'solana',
  'jp morgan': 'jpmorgan',
};
