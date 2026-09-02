# Tasks: News Impact Classification

Ordered so the free, deterministic parts are working and tested before a single paid token is
spent. Slices 1–3 ship without ever calling a model.

---

## Slice 1 — Somewhere to put news

- [x] Read `db/migrations/` and take the **next free number** — spec 011 claims `0005`. _(Used `0008` — 0005–0007 already taken.)_
- [x] `public.news_items`: `url_hash` **UNIQUE**, `url`, `title`, `source`, `feed_url`, `published_at`, `ingested_at`, `classified_at` (nullable — this is the work queue), `raw jsonb`.
- [x] `public.news_classifications`: FK to `news_items`, `scope`, `asset_id` (FK, nullable), `direction`, `magnitude`, `horizon_hours`, `confidence`, `rationale`, `model`, `prompt_version`, token and `cost_usd` columns. Named check constraints on `direction` and `magnitude`.
- [x] `public.signals`: add `kind` (default `'market_state'` so every existing row is correct), `news_item_id`, `source_url`, `expires_at`. Read `0004_signals.sql` first — the existing uniqueness constraint and `since_ts` carry-forward must keep working untouched.
- [x] Idempotent, `public.`-prefixed, named constraints, matching `0001_analytics.sql` house style.
- [x] Apply: `node --env-file=.env.local scripts/migrate.mjs`. Confirm columns and constraints exist.
- [x] Audit every existing query against `public.signals` and scope it to `kind` explicitly rather than letting it inherit.

**Blocks:** slices 2–5.

---

## Slice 2 — Constants, out of the way first

- [x] `src/consts/news.ts`: feed URLs, `NEWS_INGEST_WINDOW_HOURS`, `NEWS_CLASSIFY_BATCH_SIZE`, `NEWS_CLASSIFY_MAX_PER_RUN`, `NEWS_CLASSIFY_INTERVAL_HOURS`, `NEWS_PROMPT_VERSION`, classification model id, magnitude→severity map, horizon bounds.
- [x] Move the RSS feed list out of `src/lib/marketData.ts` and have both consumers read it from here. **This is the only change to `marketData.ts` in this spec** — its behaviour must not otherwise move, or the forecast score series becomes uninterpretable.

---

## Slice 3 — Ingest, with no model in sight

- [x] `src/lib/collectors/newsFeed.ts`, following the existing collector shape.
- [x] URL normalisation: strip `utm_*` and tracking parameters, lowercase host, drop fragment, then hash. Two spellings of one article must produce one hash.
- [x] Keep title, canonical URL, source, `published_at` from the feed, and the raw item.
- [x] Discard articles older than `NEWS_INGEST_WINDOW_HOURS` at ingest.
- [x] Insert `ON CONFLICT (url_hash) DO NOTHING`.
- [x] **A failing feed contributes nothing** — no placeholder string, ever — and is recorded in the run's source status. It does not affect the other feeds.
- [x] Call it from `/api/collect` **after** snapshots commit and after market-state signal generation. A news failure must never fail the run.
- [x] `src/scripts/news.test.ts` (pattern: `signal-rules.test.ts`, `npx tsx`, non-zero exit on failure): URL normalisation and hash-collapse cases.
- [x] Verify by running collection twice: each article lands once. _(Guaranteed by `url_hash` UNIQUE + `ON CONFLICT DO NOTHING`; live double-run pending deployed collector.)_

**Done when:** articles accumulate in `news_items` with `classified_at` null, and no model has been called.

---

## Slice 4 — Classification

- [x] `src/lib/news/classify.ts`: batch up to `NEWS_CLASSIFY_BATCH_SIZE` unclassified items into one **structured tool-use** call on the cheap tier, following `src/lib/forecast/claude.ts`. Never parse free text. Do not add a second provider layer — reuse the pattern in `src/lib/forecastProvider.ts`. _(Uses `@anthropic-ai/sdk` client directly, forced `tool_choice`, one `classify_news` tool; batch loop of `NEWS_CLASSIFY_BATCH_SIZE` capped at `NEWS_CLASSIFY_MAX_PER_RUN`.)_
- [x] System prompt as a versioned constant. _(`NEWS_CLASSIFY_SYSTEM_PROMPT` in `src/lib/news/prompt.ts`, version `NEWS_PROMPT_VERSION` in `src/consts/news.ts` — mirrors the forecast prompt precedent. Lists BTC/ETH/SOL; untracked → `market` or `drop`, never coercion; magnitude vs confidence separated with a worked example; `NEUTRAL` stated as expected; rationale must cite headline content; non-financial-advice framing.)_
- [x] Validate before persisting. _(`validateClassification(raw, trackedSymbols)` — pure, exported. Every rejection is a dropped row, never coerced.)_
- [x] Persist `model`, `prompt_version`, tokens and `cost_usd` per call. Measured, not estimated. _(`persistClassifications` in `src/lib/db/news.ts`; cost via `computeModelCostUsd` in `src/consts/forecastPricing.ts` — Haiku already priced.)_
- [x] Gate on `NEWS_CLASSIFY_INTERVAL_HOURS`; cap at `NEWS_CLASSIFY_MAX_PER_RUN`, deferring the remainder to the next run. _(`isCadenceElapsed`, keyed on `max(news_classifications.created_at)`.)_
- [x] **On failure, write nothing** — no neutral row, no placeholder, no re-dated previous answer. Record it in source status. _(`{ source: 'news:classify', ok: false, error }`; batch insert + `classified_at` stamp in one transaction.)_
- [x] Tests: `src/scripts/news-classify.test.ts` — 60 checks, `npx tsx`, non-zero exit on failure. Mocked Anthropic client + injected DB seams; every validation-rejection case, API failure, transaction failure, cadence gate, mock mode, and the `(news_item_id, prompt_version)` conflict target.
- [x] Wired into `/api/collect` after the ingest block, same isolation discipline.

**Done when:** items get classified, malformed results are dropped silently and visibly in source status, and cost per run is a number you can read out of the database.

---

## Slice 5 — Publish into the feed

- [x] `src/lib/news/publish.ts`: one `public.signals` row per classification — `kind = 'news'`, `tag = direction`, source name, `source_url`, `expires_at = published_at + horizon_hours`, `severity` from the magnitude map. _(Also `0009_news_signals_nullable_asset.sql` — `signals.asset_id` made nullable for market-scope news, asset-required moved into `signals_kind_shape_check`.)_
- [x] **Ageing uses `published_at`.** Not `classified_at`, not `now()`. Add an explicit test that a freshly classified week-old article reports as a week old — this is the defect spec 014 already fixed once (`decisions.md` §3, instance 2).
- [x] `GET /api/signals`: optional `scope` parameter; live rows are those not past `expires_at`. Still reads stored rows only — no computation, no external call, no mock fallback.
- [x] Tests: `?scope=ETH` returns ETH-scoped and no `market` rows; unfiltered returns both kinds; expired rows are excluded from live results but remain in the table.

---

## Slice 6 — The feed surface

- [x] `SignalsPage.tsx`: news cards distinct from rule cards — source name, headline, scope badge, magnitude, outbound link with `rel="noopener noreferrer"`, article age.
- [x] Client-side scope filter over the existing SWR hook: all / market-wide / one asset.
- [x] Empty state: "no live news signals". Never hide the section; never backfill it with expired items.
- [x] The page shows the true age of the newest news item.
- [x] Confirm market-state signals are unchanged in content, ordering and freshness behaviour.

---

## Slice 7 — Calibration read and record

- [ ] Read twenty consecutively classified items against their headlines. The check is **calibration, not accuracy**: does `NEUTRAL` appear for routine coverage, is scope assigned sensibly, is magnitude distinct from confidence? If everything is `HIGH` and directional, the prompt is wrong — fix it, bump `NEWS_PROMPT_VERSION`, and read twenty more before shipping. _(PENDING — operator; needs a real classification run against a deployed collector.)_
- [ ] Measure a full run's cost against the ~$1/month allowance in `analytics-plan.md` §4 and record the real figure there. _(PENDING — operator; `cost_usd` is persisted per call, so it will be measured. `analytics-plan.md` §4 marked "target; real figure pending first run".)_
- [x] `CLAUDE.md` and `context/product/architecture.md` §7.2: describe the shipped pipeline.
- [ ] Tick the Phase 4 checkboxes in `context/product/roadmap.md`; update `context/README.md` §3. _(README §3 updated to "In progress". Roadmap boxes deliberately NOT ticked — the 20-item calibration read gates shipping.)_
- [x] Note in spec 011's follow-on work that news signals are now scoreable and what columns carry the claim.

---

## Deliberately not in any slice

- **Scoring news signals.** The data is stored for it; the resolution logic is spec 011 follow-on.
- Injecting classified news into the forecast prompt. Reasonable, but it moves the forecast score series and must not be bundled with ingest work.
- Additional feeds, Reddit or social classification, article body extraction, translation, summarisation.
- Near-duplicate detection across syndicated stories. Add it only if the feed becomes visibly repetitive.
- Any alerting.
