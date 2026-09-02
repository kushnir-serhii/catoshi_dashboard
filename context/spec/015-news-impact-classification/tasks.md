# Tasks: News Impact Classification

Ordered so the free, deterministic parts are working and tested before a single paid token is
spent. Slices 1–3 ship without ever calling a model.

---

## Slice 1 — Somewhere to put news

- [ ] Read `db/migrations/` and take the **next free number** — spec 011 claims `0005`.
- [ ] `public.news_items`: `url_hash` **UNIQUE**, `url`, `title`, `source`, `feed_url`, `published_at`, `ingested_at`, `classified_at` (nullable — this is the work queue), `raw jsonb`.
- [ ] `public.news_classifications`: FK to `news_items`, `scope`, `asset_id` (FK, nullable), `direction`, `magnitude`, `horizon_hours`, `confidence`, `rationale`, `model`, `prompt_version`, token and `cost_usd` columns. Named check constraints on `direction` and `magnitude`.
- [ ] `public.signals`: add `kind` (default `'market_state'` so every existing row is correct), `news_item_id`, `source_url`, `expires_at`. Read `0004_signals.sql` first — the existing uniqueness constraint and `since_ts` carry-forward must keep working untouched.
- [ ] Idempotent, `public.`-prefixed, named constraints, matching `0001_analytics.sql` house style.
- [ ] Apply: `node --env-file=.env.local scripts/migrate.mjs`. Confirm columns and constraints exist.
- [ ] Audit every existing query against `public.signals` and scope it to `kind` explicitly rather than letting it inherit.

**Blocks:** slices 2–5.

---

## Slice 2 — Constants, out of the way first

- [ ] `src/consts/news.ts`: feed URLs, `NEWS_INGEST_WINDOW_HOURS`, `NEWS_CLASSIFY_BATCH_SIZE`, `NEWS_CLASSIFY_MAX_PER_RUN`, `NEWS_CLASSIFY_INTERVAL_HOURS`, `NEWS_PROMPT_VERSION`, classification model id, magnitude→severity map, horizon bounds.
- [ ] Move the RSS feed list out of `src/lib/marketData.ts` and have both consumers read it from here. **This is the only change to `marketData.ts` in this spec** — its behaviour must not otherwise move, or the forecast score series becomes uninterpretable.

---

## Slice 3 — Ingest, with no model in sight

- [ ] `src/lib/collectors/newsFeed.ts`, following the existing collector shape.
- [ ] URL normalisation: strip `utm_*` and tracking parameters, lowercase host, drop fragment, then hash. Two spellings of one article must produce one hash.
- [ ] Keep title, canonical URL, source, `published_at` from the feed, and the raw item.
- [ ] Discard articles older than `NEWS_INGEST_WINDOW_HOURS` at ingest.
- [ ] Insert `ON CONFLICT (url_hash) DO NOTHING`.
- [ ] **A failing feed contributes nothing** — no placeholder string, ever — and is recorded in the run's source status. It does not affect the other feeds.
- [ ] Call it from `/api/collect` **after** snapshots commit and after market-state signal generation. A news failure must never fail the run.
- [ ] `src/scripts/news.test.ts` (pattern: `signal-rules.test.ts`, `npx tsx`, non-zero exit on failure): URL normalisation and hash-collapse cases.
- [ ] Verify by running collection twice: each article lands once.

**Done when:** articles accumulate in `news_items` with `classified_at` null, and no model has been called.

---

## Slice 4 — Classification

- [ ] `src/lib/news/classify.ts`: batch up to `NEWS_CLASSIFY_BATCH_SIZE` unclassified items into one **structured tool-use** call on the cheap tier, following `src/lib/forecast/claude.ts`. Never parse free text. Do not add a second provider layer — reuse the pattern in `src/lib/forecastProvider.ts`.
- [ ] System prompt as a versioned constant. It must: list the tracked assets explicitly; state that an untracked asset means `market` scope or drop, never coercion; separate **magnitude** (how big) from **confidence** (how sure); make `NEUTRAL` legitimate and expected for routine coverage; require the rationale to reference the headline's content; carry the non-financial-advice framing.
- [ ] Validate before persisting. Drop, without writing: scope not `market` and not a tracked symbol; direction or magnitude out of enum; horizon outside bounds; confidence outside 0..1.
- [ ] Persist `model`, `prompt_version`, tokens and `cost_usd` per call. Measured, not estimated.
- [ ] Gate on `NEWS_CLASSIFY_INTERVAL_HOURS`; cap at `NEWS_CLASSIFY_MAX_PER_RUN`, deferring the remainder to the next run.
- [ ] **On failure, write nothing** — no neutral row, no placeholder, no re-dated previous answer. Record it in source status.
- [ ] Tests: every validation-rejection case asserts **no row is written**; a classifier failure does not fail the run; re-classification under a bumped `prompt_version` inserts a row and leaves the prior one intact.

**Done when:** items get classified, malformed results are dropped silently and visibly in source status, and cost per run is a number you can read out of the database.

---

## Slice 5 — Publish into the feed

- [ ] `src/lib/news/publish.ts`: one `public.signals` row per classification — `kind = 'news'`, `tag = direction`, source name, `source_url`, `expires_at = published_at + horizon_hours`, `severity` from the magnitude map.
- [ ] **Ageing uses `published_at`.** Not `classified_at`, not `now()`. Add an explicit test that a freshly classified week-old article reports as a week old — this is the defect spec 014 already fixed once (`decisions.md` §3, instance 2).
- [ ] `GET /api/signals`: optional `scope` parameter; live rows are those not past `expires_at`. Still reads stored rows only — no computation, no external call, no mock fallback.
- [ ] Tests: `?scope=ETH` returns ETH-scoped and no `market` rows; unfiltered returns both kinds; expired rows are excluded from live results but remain in the table.

---

## Slice 6 — The feed surface

- [ ] `SignalsPage.tsx`: news cards distinct from rule cards — source name, headline, scope badge, magnitude, outbound link with `rel="noopener noreferrer"`, article age.
- [ ] Client-side scope filter over the existing SWR hook: all / market-wide / one asset.
- [ ] Empty state: "no live news signals". Never hide the section; never backfill it with expired items.
- [ ] The page shows the true age of the newest news item.
- [ ] Confirm market-state signals are unchanged in content, ordering and freshness behaviour.

---

## Slice 7 — Calibration read and record

- [ ] Read twenty consecutively classified items against their headlines. The check is **calibration, not accuracy**: does `NEUTRAL` appear for routine coverage, is scope assigned sensibly, is magnitude distinct from confidence? If everything is `HIGH` and directional, the prompt is wrong — fix it, bump `NEWS_PROMPT_VERSION`, and read twenty more before shipping.
- [ ] Measure a full run's cost against the ~$1/month allowance in `analytics-plan.md` §4 and record the real figure there.
- [ ] `CLAUDE.md` and `context/product/architecture.md` §7.2: describe the shipped pipeline.
- [ ] Tick the Phase 4 checkboxes in `context/product/roadmap.md`; update `context/README.md` §3.
- [ ] Note in spec 011's follow-on work that news signals are now scoreable and what columns carry the claim.

---

## Deliberately not in any slice

- **Scoring news signals.** The data is stored for it; the resolution logic is spec 011 follow-on.
- Injecting classified news into the forecast prompt. Reasonable, but it moves the forecast score series and must not be bundled with ingest work.
- Additional feeds, Reddit or social classification, article body extraction, translation, summarisation.
- Near-duplicate detection across syndicated stories. Add it only if the feed becomes visibly repetitive.
- Any alerting.
