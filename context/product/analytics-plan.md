# Plan: Forecast Persistence, Market Context & Calibration

- **Type:** Cross-spec plan (proposes specs 010, 011, 012)
- **Roadmap Items:** Phase 3 → Projections & Models → **Models Explorer**; new item **Historical Analogs**
- **Status:** Draft for review
- **Author:** Serhii Kushnir

---

## 1. Why This Plan Exists (The "Why")

Catoshi generates AI forecasts today, but it forgets them.

`/api/projections` calls `generateForecast()`, wraps the result in `unstable_cache` for six hours, and returns it. When the cache expires the forecast is gone. The only durable copy is up to **five** snapshots in the user's own browser (`IndexedDB catoshi-db / catoshi-snapshots`), which never leave that device and are discarded whenever `PROJECTION_SCHEMA_VERSION` changes.

Nothing ever checks whether a forecast was right.

Meanwhile the **Models Explorer** page renders `src/data/models.ts` — a hardcoded table of invented models (`Tabnet-Pro`, `OnChain-LSTM`, `Whale-Graph`) with invented accuracy figures (`Ensemble accuracy 74.0%`, `184/258 hits`). None of these models exist. The real system runs one Claude or OpenAI call.

Spec 009 opened with exactly this concern about the projections chart:

> _"A user who compares this screen against any real price source loses trust in the whole dashboard within seconds."_

The Models page has the same defect, one level deeper: it does not just show wrong numbers, it shows a fictional system. This plan replaces that fiction with measured reality, and in doing so builds the data foundation the product needs anyway.

**Success looks like:** a user opens Models Explorer and sees that the Claude forecast has been scored on 84 resolved predictions, with a real hit rate, a real Brier score, and a breakdown showing which market conditions the forecaster handles badly — every figure traceable to a stored forecast and a real closing price.

---

## 2. Repository Audit — What Already Exists

Read before planning; these facts constrain every decision below.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| **No database is provisioned** | `@supabase/supabase-js@^2.106.2` is installed and `src/lib/supabaseClient.ts` is written, but `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are placeholders and no project exists; `/api/signals` falls back to `mockSignalsResponse` on any error, so the gap is invisible | **Provision Neon. Move the signals read onto it. One database, no silent fallback.** |
| Forecasts are never persisted server-side | `src/app/api/projections/route.ts` — `unstable_cache(..., { revalidate: 21600 })`, no write | The core gap this plan closes |
| Client-side forecast storage is capped and volatile | `src/hooks/useForecastSnapshots.ts`, max 5, discarded on schema bump (spec 009 Slice 5) | Cannot be the source of truth for calibration |
| Provider abstraction already exists | `src/lib/forecastProvider.ts` routes to `forecast/claude.ts` \| `forecast/openai.ts` by `FORECAST_PROVIDER` | Persistence hooks in at one call site |
| Market context assembly already exists | `src/lib/marketData.ts` (4 KB) feeds the forecast prompt | Extend it rather than replace it |
| Models Explorer page exists with mock data | `src/components/pages/ModelsPage.tsx`, `src/data/models.ts` | The UI shell is already built |
| `npm run daily-analysis` points at nothing | `package.json` script → `src/scripts/daily-analysis.ts`; **`src/scripts/` is empty** | Either wire it up in 010 or remove the script |
| `architecture.md` documents CryptoPanic as the news source | `architecture.md` §3 | Stale — CryptoPanic moved to paid-only; RSS is used now. Doc needs correcting |

### 2.1 Database Decision: Neon

This section previously read "Supabase, not Neon", on the grounds that Supabase was already wired and in production use. **That premise was false.** The client code exists; the project does not. `/api/signals` has been serving `mockSignalsResponse` since it shipped, because it swallows every error into that fallback.

With the "already there" argument removed, the choice was re-taken on the merits, against free-tier terms verified on 01.09.2026. **Neon.** Three reasons:

1. **It survives neglect.** Supabase pauses a free project after one week of inactivity and requires a human to resume it — and since `/api/signals` reads the same database, the pause takes the signals feed down too. Spec 010's own scheduler is disabled by GitHub after 60 days without commits, so a quiet stretch stops collection *and then* pauses the database. Neon's compute sleeps and wakes by itself in about half a second.
2. **Quotas are per project, and there are 100 of them.** Each Neon project gets its own 0.5 GB and its own 100 CU-h/month. Supabase allows two active projects per account in total; this database would take half of that allowance permanently.
3. **Headroom where the work is heavy.** Supabase free runs on shared CPU with 500 MB RAM — fine for hourly writes, tight for spec 012's HNSW index build and for percentile aggregates over a hundred thousand rows. Neon autoscales to 8 GB RAM for the seconds those queries run.

Everything the schema needs is present either way — `jsonb`, full SQL, `pgvector`. Volume is not a constraint on either: roughly **60 MB/year** at an hourly cadence across three assets, against 0.5 GB.

**Constraints to respect on Neon:** compute is metered (100 CU-h per project per month; hourly collection uses ~15), the free plan has **no automatic backups** and only a 6-hour restore window — so a weekly `pg_dump` is mandatory, not optional — and serverless callers must use the **pooled** connection endpoint.

**Cost of the switch:** delete `src/lib/supabaseClient.ts`, add `src/lib/db/client.ts` over `pg`, move `/api/signals`, swap one dependency. The migration SQL is plain Postgres and is unaffected.

---

## 3. Proposed Specs

Three specs, sequenced by dependency. Each is independently shippable.

```
010  Market Snapshot Store        ← data foundation, starts the history clock
      ↓
011  Models Explorer (real)       ← scoring + the roadmap item
      ↓  (needs ~2 months of 010 data)
012  Historical Analogs           ← pgvector, answers "what happened last time?"
```

### 3.1 Why This Order

Spec 011 is the roadmap item and carries the visible user value, so it is tempting to put it first. It is placed second deliberately.

Analog search in 012 is worthless without accumulated history, and history only accrues in wall-clock time — it cannot be back-filled for derivatives data, because Binance's `openInterestHist` and long/short ratio endpoints only retain about 30 days. **Every week 010 is delayed is a week of history permanently lost.** Scoring, by contrast, can be applied retroactively to any forecast stored from day one.

So: start writing rows first, then make them visible, then make them predictive.

---

## Spec 010 — Market Snapshot Store

**Roadmap:** enabler for Projections & Models → Models Explorer
**Depends on:** nothing
**Estimate:** ~3 days

### Purpose

Persist a structured snapshot of market conditions every hour, and persist every forecast the app generates alongside the snapshot it was based on. Nothing user-visible changes. This spec exists so that specs 011 and 012 have data to work with.

### Scope

**In-scope**

- Neon schema: `snapshots`, `forecasts`, `outcomes`, `assets` (migration SQL committed to the repo)
- A collector Route Handler assembling one snapshot from existing and new sources
- New market inputs beyond what `marketData.ts` gathers today: funding rate, open interest, long/short ratio, 24h liquidations (all from **Binance public futures endpoints — no API key**), plus ETF net flows
- Indicator computation **in TypeScript, not in the model**: RSI and moving averages per timeframe, ATR, volume z-score, distance from MAs
- Writing every `/api/projections` result into `forecasts`, with token counts and cost
- Hourly GitHub Actions trigger for the collector, with a daily Vercel cron as fallback (see Open Question 4)
- Wiring or removing the dead `daily-analysis` script

**Out-of-scope**

- Any UI change
- Scoring forecasts (spec 011)
- Vector search (spec 012)
- Migrating the five IndexedDB snapshots — they stay as a client convenience

### Slices

1. **Schema and migration** — provision Neon, replace the Supabase client with `src/lib/db/client.ts` over `pg`, `db/migrations/0001_analytics.sql`; typed row interfaces in `src/data/types.ts`
2. **Binance derivatives collector** — `src/lib/collectors/binanceFutures.ts`: `premiumIndex`, `fundingRate`, `openInterest`, `openInterestHist`, `globalLongShortAccountRatio`
3. **ETF flows and sentiment collector** — `src/lib/collectors/etfFlows.ts` (Farside table parse), `src/lib/collectors/fearGreed.ts` (alternative.me)
4. **Indicator layer** — `src/lib/indicators.ts`, pure functions, no I/O, so it is unit-testable later without touching components
5. **Snapshot assembly and write** — `src/lib/snapshotBuilder.ts` + `src/app/api/collect/route.ts`, guarded by a `CRON_SECRET` header
6. **Forecast persistence** — write-through in `src/app/api/projections/route.ts`, non-blocking: a failed insert must never break the user-facing response
7. **Scheduling** — hourly GitHub Actions workflow calling `/api/collect`, daily `vercel.json` cron as fallback, weekly `pg_dump`; verify rows land

### Key Technical Decisions

- **Indicators computed server-side, never by the model.** Sending raw candles costs roughly 80,000 tokens per call; sending a computed snapshot costs about 8,000. This is a ten-fold cost difference and it also removes a class of arithmetic error from the model's job.
- **`raw jsonb` column alongside typed columns.** Typed columns carry only fields that are filtered or aggregated. Everything else lands in `raw`, so the collector can gain fields without a migration.
- **Forecast writes are fire-and-forget.** The dashboard must not regress because the database is asleep.

---

## Spec 011 — Models Explorer with Real Accuracy

**Roadmap:** Phase 3 → Projections & Models → **Models Explorer**
**Depends on:** 010
**Estimate:** ~2.5 days

### Purpose

Score stored forecasts against what actually happened, and rebuild the Models page on those measurements. Delete `src/data/models.ts`.

### Scope

**In-scope**

- Resolution job: for each forecast whose horizon has elapsed, fetch the real price and compute the outcome
- **Brier score** as the headline metric — multi-scenario: `Σ(pᵢ − oᵢ)²`, where `oᵢ = 1` for the scenario whose range contains the actual price
- Hit rate: did the highest-probability scenario contain the actual price
- `/api/models` Route Handler serving real aggregates, replacing mock data
- Models Explorer rebuilt: one row per **provider + model + prompt version**, not per fictional model
- A regime breakdown table: accuracy split by RSI band and by positioning, so systematic bias is visible
- Empty state for the period before enough forecasts have resolved

**Out-of-scope**

- Automatic prompt tuning
- Comparing against external benchmarks
- Per-user forecast history

### Slices

1. **Scoring functions** — `src/lib/calibration.ts`: `computeBrier(scenarios, price)`, `resolveForecast(...)`; pure and testable
2. **Resolution job** — `src/app/api/resolve/route.ts`, daily cron; idempotent, safe to re-run
3. **Aggregate views** — SQL views for by-model and by-regime calibration; `/api/models` reads them
4. **Models page rebuild** — real KPI cards, real model table, regime breakdown; delete `src/data/models.ts`
5. **Empty and thin-data states** — below a minimum resolved count, show "not enough data yet" rather than a misleading percentage

### Key Technical Decisions

- **Brier over plain accuracy.** A forecaster that says 55% and is right deserves a different score from one that says 95% and is right. Plain hit rate cannot distinguish confidence from correctness, and confidence calibration is the thing actually worth improving.
- **`prompt_version` is part of the grouping key.** Otherwise a prompt change silently pollutes the historical record and the metric stops meaning anything.
- **A minimum sample threshold before displaying a figure.** Showing "100% accuracy" on three resolved forecasts would repeat exactly the honesty failure this plan sets out to fix.

---

## Spec 012 — Historical Analogs

**Roadmap:** proposed new item under Projections & Models
**Depends on:** 010, plus roughly two months of accumulated snapshots
**Estimate:** ~2 days

### Purpose

Answer the question a user actually asks — _"has this happened before, and what followed?"_ — from stored data instead of from the model's recollection.

### Scope

**In-scope**

- `pgvector` enabled on Neon; a 16-dimension normalised market-state vector per snapshot
- `find_analogs()` and `analog_summary()` SQL functions with two correctness guards
- Analog statistics injected into the forecast prompt as measured base rates
- An "Historical analogs" section in `ForecastContextPanel`: _"Of 18 comparable setups, price rose in 7 (39%); median 7-day move −2.1%"_

**Out-of-scope**

- Trading signals or recommendations derived from analogs
- Cross-asset analogs (ETH setups matched against BTC history)

### Slices

1. **Vector column and index** — migration adding `state_vec vector(16)`, a trigger building it from normalised features, HNSW index **partial per asset**
2. **Search functions** — `find_analogs()`, `analog_summary()`
3. **Prompt enrichment** — analog base rates added to the forecast input in `marketData.ts`
4. **UI surface** — analogs section in `ForecastContextPanel`, hidden below a minimum sample size

### Key Technical Decisions

- **A hand-built feature vector, not a text embedding.** Market state is numeric. Embedding a textual description of it discards magnitude, which is the entire signal. Each feature is normalised to roughly 0–1 first, otherwise L2 distance is dominated by RSI (range 0–100) and funding rate (range ~0.0002) contributes nothing.
- **Two guards against self-deception, both mandatory:**
  - *Neighbour exclusion* — snapshots within N days of the query are trivially similar to it and would manufacture false confirmation.
  - *Look-ahead guard* — snapshots whose horizon has not yet elapsed must be excluded, or the forward return is unknown and the statistic is fabricated.
- **Partial HNSW indexes per asset.** HNSW does not know about `asset_id`, so a filtered query post-filters and can under-fetch candidates. Verified on 50,000 rows: with a partial index the planner uses it directly and `find_analogs` returns in ~3.5 ms.

---

## 4. Cost

At an hourly collector and four analyses per day, using computed snapshots rather than raw candles:

| Component | Monthly |
| --- | --- |
| Neon | $0 (free plan; ~60 MB/year against 0.5 GB, ~15 of 100 CU-h/month) |
| Vercel Cron | $0 (included) |
| Binance / Farside / alternative.me | $0 (no keys required) |
| Claude Sonnet, 2 full analyses/day | ~$3.00 |
| Claude Haiku, 4 news classifications/day | ~$1.00 |
| **Total** | **~$4** |

Anthropic is cheaper than OpenAI at every equivalent tier on **output** tokens, which dominate analytical work. The existing provider abstraction means this stays a configuration choice rather than an architectural one.

---

## 5. Documentation Corrections Required

Independent of the specs above, `context/product/architecture.md` is out of date:

- §3 lists **CryptoPanic** as the news source; it moved to paid-only and RSS feeds are used instead
- §7 describes browser-side persistence only; once spec 010 ships, a **Data Persistence** section covering Neon must be added
- No server-side database is mentioned anywhere in the architecture document

---

## 6. Open Questions

1. **Collector frequency** — hourly gives better analog resolution; every six hours is cheaper and matches the existing 6-hour projection cache. Hourly is assumed above.
2. **Asset coverage** — snapshots for BTC/ETH/SOL (matching `DEFAULT_FORECAST_TARGETS`), or ETH only to start?
3. **Retention** — keep snapshots indefinitely, or roll up to daily after a year? At current volume, indefinite is affordable for a decade.
4. ~~**Cron mechanism** — Vercel Cron is assumed.~~ **Resolved in spec 010:** Vercel Cron cannot do this. **Hobby accounts are limited to cron jobs that run once per day** — an hourly expression fails at deploy time, and Hobby scheduling precision is ±59 minutes regardless. The collector is scheduled from **GitHub Actions** instead (free, hourly, versioned in the repo), with a daily Vercel cron kept as a fallback. A Claude Code Routine remains a reasonable option for the weekly calibration review in spec 011, but not for the primary collector while it is in research preview.

---

*This is an implementation plan, not financial advice. No model predicts markets; the purpose of this system is a disciplined, calibrated and documented forecasting process whose errors are measurable.*
