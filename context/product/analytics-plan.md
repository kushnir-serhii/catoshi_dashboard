# Plan: Forecast Persistence, Market Context & Calibration

- **Type:** Cross-spec plan (proposed specs 010, 011, 012)
- **Roadmap Items:** Phase 5 → Keeping Score; Phase 6 → Historical Analogs (gated)
- **Status:** **Partly executed.** Revised 02.09.2026
- **Author:** Serhii Kushnir

> **How to read this document.** It is the reasoning behind specs 010, 011 and 012 —
> why they exist, in what order, and which trade-offs were taken. It is **not** a status
> report. Current status lives in `context/README.md` §3 and `EXECUTION-PLAN.md`.
>
> Changes since this was written:
> - **Spec 010 has shipped.** §2's audit table describes the repository *before* it did.
> - **Spec 011 and 012 are specced but unbuilt.** Their spec folders supersede §§ below
>   wherever they disagree.
> - **The Brier baseline correction in `decisions.md` §6 is now applied inline in §"Spec 011"
>   below.** The coin-flip line for a three-scenario forecast is **0.667**, not 0.25.
> - **Spec 012 is gated on a falsification test** that has been written but never run —
>   see `spec/012-historical-analogs/functional-spec.md` §Gate.
> - **Spec 015 (news impact classification) did not exist when this was written** and is
>   now the fourth spec in this family. §4's cost table already anticipated its Haiku tier.
> - **Portfolio, wallet and personal-data features are out of scope** as of 02.09.2026.
> - §5 "Documentation Corrections Required" is **done** — `architecture.md` was corrected.

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
- **Brier score** as the headline metric — multi-category: `BS = Σ(pᵢ − oᵢ)²` over the three mutually exclusive scenarios, where `oᵢ = 1` for the scenario whose range contains the actual price and `0` for the other two. **Range is 0 (best) … 2 (worst), and the no-skill baseline is 0.667, not the binary 0.25.** A know-nothing forecaster answering `1/3, 1/3, 1/3` scores `(1/3 − 1)² + (1/3)² + (1/3)² = 0.667`; the 0.25 figure is the baseline for the *binary, single-event* Brier form (`(p − o)²`, one probability) and does not apply here — judged against 0.25, a genuinely skilled forecaster is marked as failing. The baseline follows each forecast's own scenario count. Display the skill score against that baseline, never the raw number alone (`decisions.md` §6)
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

## 5. Documentation Corrections Required — **done**

`context/product/architecture.md` has been corrected: CryptoPanic removed as the news
source, the Neon **Data Persistence** section added (§7), and the signal, news and scoring
layers documented (§§7.1–7.3). Nothing outstanding here.

---

## 6. Open Questions — all resolved

1. ~~**Collector frequency.**~~ **Hourly.** Shipped in spec 010.
2. ~~**Asset coverage.**~~ **BTC, ETH, SOL** — matches `DEFAULT_FORECAST_TARGETS` and the
   seeded `assets` table.
3. ~~**Retention.**~~ **Indefinite.** ~60 MB/year against 0.5 GB; affordable for a decade.
   Revisit only if storage crosses 60%.
4. ~~**Cron mechanism.**~~ **GitHub Actions hourly**, daily `vercel.json` cron as fallback.
   Vercel Hobby cron cannot run hourly — an hourly expression fails at deploy time, and Hobby
   precision is ±59 minutes regardless. A Claude Code Routine is acceptable for the weekly
   calibration review in spec 011, but not for the primary collector while it is in research
   preview. Full reasoning: `decisions.md` §4.
5. **Backfill resolution** — **still open**, and the only genuinely unresolved question in this
   family. The falsification work points at hourly (power appears between n = 3,000 and
   n = 8,000; daily gives ~3,100 per asset). Spec 013 argues for daily on storage (hourly is
   54% of the free plan) and, more importantly, on **effective** sample size: intraday
   snapshots are near-duplicates that the neighbour-exclusion guard discards anyway. Resolve
   it by evidence, not argument — the procedure is in `decisions.md` §7.1. Ship daily first.

---

# Appendices — reference material

_Added 02.09.2026, translated from the project's Ukrainian working notes so that `context/`
is genuinely self-sufficient. Nothing below lives anywhere else._

## Appendix A — Data sources

All free. "Key" means authentication is required.

| Checklist # | Data | Source | Key |
|---|---|---|---|
| 1 | OHLC 15m / 1h / 4h / 1d | Binance `GET /fapi/v1/klines` | ❌ |
| 2 | Funding rate (current) | Binance `GET /fapi/v1/premiumIndex` | ❌ |
| 2 | Funding rate (history) | Binance `GET /fapi/v1/fundingRate` | ❌ |
| 2 | Open interest | Binance `GET /fapi/v1/openInterest` | ❌ |
| 2 | OI history | Binance `GET /futures/data/openInterestHist` | ❌ |
| 2 | Long/short ratio (accounts) | Binance `GET /futures/data/globalLongShortAccountRatio` | ❌ |
| 2 | Top-trader long/short | Binance `GET /futures/data/topLongShortPositionRatio` | ❌ |
| 3 | Liquidations | Binance WS `!forceOrder@arr` — aggregate yourself | ❌ |
| 4 | ETF flows | `farside.co.uk/eth/`, `/btc/` — HTML table parse | ❌ |
| 5 | Macro calendar | manual config + RSS | — |
| 6 | Regulatory / news | RSS: CoinDesk, Decrypt, Cointelegraph | ❌ |
| 8 | Fear & Greed | `api.alternative.me/fng/?limit=30` | ❌ |
| — | Price, market cap, dominance | CoinGecko `/api/v3` | demo |

**The key finding:** checklist items 2–3 do not need a paid Coinglass subscription. The public
Binance Futures API returns funding, open interest and long/short without a key.

**What backfills and what does not.** Binance retains `openInterestHist` and long/short for
about 30 days, and liquidations exist only in real time — that history is lost permanently, so
collection had to start as early as possible. But `klines` returns OHLCV from 2017, and
`alternative.me/fng/?limit=0` returns the whole index history, so the **price side of a snapshot
backfills for years**. Backfilled rows are labelled `raw->>'backfill' = true` and never mixed
with complete rows during calibration.

## Appendix B — Indicator set

Computed locally as pure functions in `src/lib/indicators.ts`, no library, never by the model:

- RSI(14) on each of the four timeframes
- MA7 / MA25 / MA99 on each timeframe
- Distance from each MA, as a percentage
- ATR(14) — for stops and expected range
- Volume z-score (current vs 20-candle mean)
- Structure: sequence of higher/lower highs and lows over N candles
- OI change % over 24 h; funding change over 24 h
- ETF: consecutive days of inflow/outflow, and the 7-day sum

Saving: ~80,000 tokens of raw candles → ~8,000 for a computed snapshot.

## Appendix C — Model tiering and prices (as of 08.2026)

| Model | Input /MTok | Output /MTok | 1 analysis* | 120 runs/month |
|---|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | $0.025 | $3.0 |
| **Claude Sonnet 5** | **$2** | **$10** | **$0.05** | **$6.0** |
| Claude Opus 5 | $5 | $25 | $0.125 | $15.0 |
| GPT-5.4 mini | $0.75 | $4.50 | $0.021 | $2.5 |
| GPT-5.6 Luna | $1 | $6 | $0.028 | $3.4 |
| GPT-5.6 Terra | $2.50 | $15 | $0.07 | $8.4 |
| GPT-5.6 Sol | $5 | $30 | $0.14 | $16.8 |
| GPT-5.5 Pro | $30 | $180 | $0.84 | $100.8 |

\* at 10k input / 3k output.

**Decision — a two-tier scheme, ~$4/month:**

- **Haiku** — the cheap tier: news classification (spec 015) and anomaly detection.
- **Sonnet** — full checklist analysis, twice daily.
- **Opus** — weekly deep review and calibration review (~$0.5/month).

Anthropic is cheaper on output at every equivalent tier, and analytical work is
output-dominated. The bottleneck for this task is not raw model intelligence; it is adherence
to the checklist structure and probability calibration.

Enable both discounts: **prompt caching** (the checklist system prompt is cached, reads at
0.1× price) and the **Batch API** (50% off when the analysis is not needed in real time).

These prices belong in a `MODEL_PRICING` constant beside `PROMPT_VERSION` — see
`src/consts/forecastPricing.ts`. Without them `forecasts.cost_usd` has nothing to compute from.

## Appendix D — Forecast contract

**System prompt — fixed, and containing:**

1. The 10-point pre-forecast checklist (Appendix E).
2. The rule from Miss #1: never draw a directional conclusion from technical analysis alone
   when volatility is compressed, positioning is one-sided, and a macro trigger sits inside the
   horizon.
3. A requirement to always give probabilities, never "it will not".
4. The non-financial-advice framing.

**Forced JSON output schema** (tool use / structured output):

```json
{
  "as_of": "2026-08-25T09:30:00Z",
  "horizon": "1d | 7d | 30d",
  "scenarios": [
    { "label": "range", "low": 2440, "high": 2545, "probability": 0.55 }
  ],
  "levels": { "resistance": [2546, 2600], "support": [2464, 2400] },
  "invalidation": 2400,
  "key_risks": ["..."],
  "confidence": "low | medium | high",
  "reasoning_summary": "..."
}
```

`probability` must sum to 1, checked twice: by a validator in code, and by a trigger on the
`forecasts` table (±0.02).

**The prompt version is written into every `forecasts.prompt_version` row** and bumped on every
prompt change. Without it, a prompt edit silently corrupts the historical record and the
accuracy metric stops meaning anything.

## Appendix E — The pre-forecast checklist

The manual process this pipeline automates. Ten points, in order:

| # | Factor | Where to look |
|---|---|---|
| 1 | TA: structure, levels, MAs, RSI across 4 timeframes | chart |
| 2 | Positioning: long/short ratio, OI, funding | Binance futures API |
| 3 | 24 h liquidations, and which side | Binance WS |
| 4 | Spot ETF flows — the streak, not one day | Farside / SoSoValue |
| 5 | Macro calendar: FOMC, CPI, Treasury, Jackson Hole | economic calendar |
| 6 | Regulation and politics: bills, SEC, ETF filings | news |
| 7 | On-chain: exchange balances, staking, whale transactions | — |
| 8 | Sentiment: Fear & Greed, social activity | alternative.me |
| 9 | Asset specifics: upgrades, foundation activity, L2s | — |
| 10 | **Geopolitics: active conflicts, oil, shipping lanes** | news (added 02.09.2026) |

Point 10 was added after a forecast was directionally right for entirely the wrong reason — the
actual trigger was a military strike that was not in the model at all. Being right for the wrong
reason is not skill and must not be recorded as a success.

**The exogenous-shock rule that came with it:** assess separately the probability of an event
outside the chart and outside the calendar — roughly 5% in a normal week, 20–30% per week during
an active conflict. It does not spread evenly across scenarios; it almost always thickens the
bearish side, because crypto in a shock correlates with risk assets rather than with gold.

---

*This is an implementation plan, not financial advice. No model predicts markets; the purpose of this system is a disciplined, calibrated and documented forecasting process whose errors are measurable.*
