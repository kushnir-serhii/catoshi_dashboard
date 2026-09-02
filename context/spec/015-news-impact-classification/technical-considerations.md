# Technical Specification: News Impact Classification

- **Functional Specification:** `./functional-spec.md`
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Three stages, deliberately separated so each can fail without the others:

```
ingest            classify                     publish
RSS → news_items  news_items → classification  → public.signals (kind = 'news')
(cheap, frequent) (LLM, batched, capped)        (read by the existing feed)
```

Ingest is dumb, cheap and idempotent. Classification is the only paid step and is
independently rate-limited and capped. Publication reuses the spec 014 signals table so the
feed stays one query.

Nothing here is on the user's request path. All three stages run server-side inside the
`/api/collect` run, after snapshots commit and after market-state signal generation, so a
news failure can never delay or degrade the market-state signals that are already shipping.

### 1.1 What already exists

`src/lib/marketData.ts` fetches the same three RSS feeds through the `rss2json.com` bridge,
but only for the forecast prompt. It is **not reusable as-is**, for two reasons:

- It keeps only `item.title`, discarding the URL, source and `pubDate` this spec needs for
  de-duplication, linking and ageing.
- On failure it returns the strings `'News fetch failed'` / `'No news available'`, which flow
  into the forecast prompt as if they were news. That is a small instance of the pattern in
  `decisions.md` §3 and must not be copied into the new path.

Build a separate collector under `src/lib/collectors/` following the shape of the existing
collectors, and leave `marketData.ts` alone for now — changing the forecast prompt's inputs in
the same spec would confound the forecast score series.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Data model

One new migration. **Spec 011 claims `0005`; use the next free number** — read
`db/migrations/` before writing, and follow the house style of `0001_analytics.sql`:
idempotent, `public.` prefix, named constraints.

**`public.news_items`** — the raw article, one row per article, ever.

| Column | Notes |
|---|---|
| `id` | PK |
| `url_hash` | **`UNIQUE`** — hash of the canonical URL. The de-duplication key |
| `url`, `title`, `source`, `feed_url` | as ingested |
| `published_at` | from the feed; **not** ingest time |
| `ingested_at` | server time |
| `classified_at` | `NULL` until classified — this is the work queue |
| `raw jsonb` | the feed item as received, for fields not yet typed |

**`public.news_classifications`** — one row per classification attempt that produced a result.

| Column | Notes |
|---|---|
| `news_item_id` | FK → `news_items` |
| `scope` | `'market'` or an `assets.symbol` |
| `asset_id` | FK → `assets`, `NULL` when scope is `market` |
| `direction` | check against `('BULLISH','BEARISH','NEUTRAL')` — same vocabulary as `public.signals` |
| `magnitude` | check against `('LOW','MEDIUM','HIGH')` |
| `horizon_hours` | integer, the asserted window |
| `confidence` | 0..1 |
| `rationale` | one sentence |
| `model`, `prompt_version` | grouping keys for later scoring |
| `input_tokens`, `output_tokens`, `cost_usd` | measured, not estimated |

Splitting the tables matters: re-classifying under a new `prompt_version` must add a row, not
overwrite one, or the record of what the old prompt asserted is destroyed — the same reasoning
that puts `prompt_version` on `forecasts`.

**`public.signals`** gains a `kind` column (`'market_state'` | `'news'`, defaulting to
`'market_state'` so existing rows are correct), plus nullable `news_item_id`, `source_url` and
`expires_at`. Read `db/migrations/0004_signals.sql` before writing this — the existing
uniqueness constraint and `since_ts` carry-forward logic must keep working untouched for
market-state rows.

### 2.2 Ingest — `src/lib/collectors/newsFeed.ts`

- Fetch each feed independently. **One feed failing yields nothing from that feed** and is
  recorded in source status; it never yields a placeholder string and never fails the others.
- Normalise the URL before hashing: strip `utm_*` and other tracking query parameters,
  lowercase the host, drop the fragment. Otherwise the same article arrives twice with
  different campaign tags and gets classified — and paid for — twice.
- Discard articles older than `NEWS_INGEST_WINDOW_HOURS` at ingest.
- Insert with `ON CONFLICT (url_hash) DO NOTHING`. Ingest is idempotent by construction.

### 2.3 Classification — `src/lib/news/classify.ts`

- **Model tier:** the cheap tier (Haiku), through the existing provider abstraction pattern in
  `src/lib/forecastProvider.ts`. Do not add a second, parallel provider layer.
- **Structured output only**, via tool use, exactly as `src/lib/forecast/claude.ts` does for
  forecasts. Never parse free text.
- **Batch:** one call classifies up to `NEWS_CLASSIFY_BATCH_SIZE` unclassified items. Batching
  is what makes the system prompt cacheable and keeps the cost near the ~$1/month allowance.
- **Cap:** at most `NEWS_CLASSIFY_MAX_PER_RUN` items per collection run. The remainder waits
  for the next run — an unbounded backlog must never become an unbounded bill.
- **Cadence:** classification runs every `NEWS_CLASSIFY_INTERVAL_HOURS`, not every hourly
  collection run. News does not arrive fast enough to justify hourly LLM calls.
- **Validation before persistence.** Reject and drop, without writing, any result where:
  scope is not `market` and not a tracked symbol; direction or magnitude is outside its
  enum; `horizon_hours` is outside the configured bounds; confidence is outside 0..1. A
  malformed classification is a dropped row, never a coerced one.
- **The system prompt is a constant with a version**, alongside the forecast prompt's. Every
  edit bumps `NEWS_PROMPT_VERSION`.

**Prompt design notes that belong in the prompt itself:**

- Give the model the tracked asset list explicitly, and instruct it that an untracked asset
  means `market` scope or drop — never coercion onto a tracked symbol.
- Instruct it to distinguish **magnitude** (how big) from **confidence** (how sure). These
  collapse into one number unless the prompt separates them.
- Make `NEUTRAL` legitimate and expected for routine coverage. Most crypto headlines are
  noise; a classifier that never says so is useless and expensive.
- Require the rationale to reference the headline's content, so a wrong classification is
  visibly wrong rather than plausibly vague.
- Carry the non-financial-advice framing, as the forecast prompt does.

### 2.4 Publication — `src/lib/news/publish.ts`

- Insert one `public.signals` row per classification, with `kind = 'news'`,
  `tag = direction`, source name in `source`, the article URL in `source_url`, and
  `expires_at = published_at + horizon_hours`.
- `severity` for a news row is derived from `magnitude` (LOW/MEDIUM/HIGH → fixed points in
  0..1), so the existing ordering logic works unchanged across both kinds.
- **Ageing uses `published_at`.** Not `classified_at`, not `now()`. This is the same defect
  spec 014 fixed for market-state signals (`decisions.md` §3, instance 2) and it must not
  reappear through a different door.

### 2.5 API and UI

- **`GET /api/signals`** gains an optional `scope` parameter (`market` | asset symbol) and
  continues to serve stored rows only — **no computation, no external call, no mock
  fallback**. Live rows are those not past `expires_at`.
- **`SignalsPage.tsx`** renders news cards distinctly: source name, headline, scope badge,
  magnitude, an outbound link with `rel="noopener noreferrer"`, and the article's age.
- The scope filter is a client-side control over the existing SWR hook.
- **Empty state:** if no news item is live, say "no live news signals" — never hide the
  section, and never backfill it with expired items.

### 2.6 Constants

All of the following go in `src/consts/news.ts`, per the repository's constants rule: feed
URLs, `NEWS_INGEST_WINDOW_HOURS`, `NEWS_CLASSIFY_BATCH_SIZE`, `NEWS_CLASSIFY_MAX_PER_RUN`,
`NEWS_CLASSIFY_INTERVAL_HOURS`, `NEWS_PROMPT_VERSION`, the classification model id, the
magnitude→severity map, and the allowed horizon bounds. Move the feed list out of
`marketData.ts` and have both consumers read it from here.

---

## 3. Impact and Risk Analysis

**System Dependencies:** `public.signals` and `public.assets` (spec 010/014); the
`/api/collect` run; the Anthropic SDK and provider abstraction; the `rss2json.com` bridge;
`SignalsPage` and `useSignals`.

| Risk | Mitigation |
|---|---|
| **Cost runs away** — a feed spike or a retry loop classifies hundreds of items | Hard per-run cap, batch size, interval gate, and persisted `cost_usd` so the real figure is observable from day one |
| **`rss2json.com` free tier throttles or disappears** | It is a single point of failure for a non-critical feature. Per-feed failure is already isolated; if the bridge proves unreliable, replace it with server-side RSS parsing — an implementation change behind `newsFeed.ts`, not a spec change |
| **Duplicate articles across feeds** — the same story syndicated under different URLs | URL-hash dedup catches identical URLs only. Near-duplicates are accepted for now; if the feed becomes visibly repetitive, add title-similarity dedup as a follow-on. Do not solve it speculatively |
| **The classifier is systematically bullish** | This is the reason for §2.4 of the functional spec. The data to detect it is stored from day one; spec 011 follow-on work measures it. Until then, the UI must not imply the classification is validated |
| **A news signal is read as advice** | Non-financial-advice framing on the surface and in the prompt; the card shows the source and links out, so the user reads the article, not the model |
| **News rows pollute market-state signal queries** | `kind` is on the table with a default that makes every existing row correct; every existing query is reviewed and scoped explicitly rather than left to inherit |
| **Prompt drift silently corrupts the record** | `prompt_version` on every classification row; re-classification inserts rather than updates |

**Reversibility:** high. Dropping the feature means ceasing to write `kind = 'news'` rows and
hiding the filter; the market-state feed is unaffected.

---

## 4. Testing Strategy

Follow the spec 014 pattern — `src/scripts/signal-rules.test.ts`, run with `npx tsx`, exits
non-zero on failure. Pure logic is tested; the LLM is not.

**Unit (no network, no database):**

- URL normalisation and hashing: tracking parameters stripped, host case-folded, fragment
  dropped, two spellings of one article producing one hash.
- Classification-result validation: untracked symbol → `market` or drop; out-of-enum direction
  or magnitude → dropped; horizon outside bounds → dropped; confidence outside 0..1 → dropped.
  Each case asserts **no row is written**.
- Magnitude → severity mapping, including ordering against market-state severities.
- Expiry: `published_at + horizon_hours` computed correctly across a DST boundary and in UTC.
- Ageing uses `published_at` — an explicit test that a freshly classified but week-old article
  reports as a week old.

**Integration (local database, mocked classifier):**

- Ingesting the same feed twice inserts each article once.
- A feed returning an error contributes zero rows and records a source-status failure.
- A classifier failure writes nothing and does not fail the collection run.
- Re-classification under a bumped `prompt_version` adds a row and leaves the prior one intact.
- `/api/signals?scope=ETH` returns ETH-scoped and no `market` rows; unfiltered returns both
  kinds; expired rows are excluded from live results but still present in the table.

**Manual before shipping:**

- Read twenty consecutively classified items against their headlines. The check is not
  accuracy — that comes later — but **calibration**: does `NEUTRAL` appear for routine
  coverage, is scope assigned sensibly, is magnitude distinguished from confidence? If every
  item is `HIGH` and directional, the prompt is wrong and shipping it would fill the feed with
  confident noise.
- Confirm the measured cost of a full run against the ~$1/month allowance.
