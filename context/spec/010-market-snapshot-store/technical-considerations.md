# Technical Specification: Market Snapshot Store

- **Functional Specification:** [context/spec/010-market-snapshot-store/functional-spec.md](./functional-spec.md)
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

The product has **no provisioned database**. `@supabase/supabase-js` is installed and `src/lib/supabaseClient.ts` is written, but no Supabase project was ever created: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are placeholders, and `/api/signals` returns `mockSignalsResponse` on any error — which is exactly why the absence has never surfaced. The signals feed has been serving mock data since it shipped.

This specification provisions **Neon Postgres** and moves the signals read onto it, so the product ends with one database and no silent fallback.

Three things are added, in order of dependency:

| Layer | What | Where |
|---|---|---|
| **Storage** | Four tables — `assets`, `snapshots`, `forecasts`, `outcomes` | Neon migration |
| **Collection** | Per-source fetchers, an indicator layer, and a builder that composes one snapshot | `src/lib/collectors/`, `src/lib/indicators.ts`, `src/lib/snapshotBuilder.ts` |
| **Triggering** | An authenticated collection endpoint, called hourly | `src/app/api/collect/route.ts`, GitHub Actions |

Forecast persistence hooks into the single place forecasts are created — inside `getCachedForecast()` in `src/app/api/projections/route.ts`, within the `unstable_cache` callback. Placing the write there rather than in the `GET` handler satisfies AC 2.1's "one generation, one record": the callback body runs only on a genuine cache miss, so a cache hit writes nothing.

**Affected files:**

| File | Change |
|---|---|
| `db/migrations/0001_analytics.sql` | **New** — the four tables, indexes and constraints |
| `src/lib/db/client.ts` | **New** — `pg` Pool against the Neon **pooled** endpoint |
| `src/lib/db/analytics.ts` | **New** — typed insert/select helpers over `src/lib/db/client.ts` |
| `src/lib/supabaseClient.ts` | **Deleted** — replaced by `src/lib/db/client.ts` |
| `src/app/api/signals/route.ts` | Modified — read `signals` over `pg`; the silent mock fallback becomes a logged error |
| `src/lib/collectors/binanceFutures.ts` | **New** — funding, open interest, long/short |
| `src/lib/collectors/binanceKlines.ts` | **New** — OHLCV for four timeframes |
| `src/lib/collectors/etfFlows.ts` | **New** — Farside table parse |
| `src/lib/collectors/fearGreed.ts` | **New** — alternative.me |
| `src/lib/indicators.ts` | **New** — RSI, SMA, ATR, z-score; pure |
| `src/lib/snapshotBuilder.ts` | **New** — composes one snapshot from all sources |
| `src/app/api/collect/route.ts` | **New** — authenticated collection endpoint |
| `src/app/api/projections/route.ts` | Modified — write-through forecast persistence |
| `src/data/types.ts` | Modified — `MarketSnapshot`, `StoredForecast` row types |
| `src/consts/collect.ts` | **New** — collected assets, timeframes, source URLs |
| `.github/workflows/collect.yml` | **New** — hourly scheduler |
| `vercel.json` | **New/modified** — daily fallback cron |
| `package.json` | Modified — `@supabase/supabase-js` removed, `pg` added; `daily-analysis` script repointed or removed |
| `context/product/architecture.md` | Modified — Data Persistence section (Neon); CryptoPanic correction |

No new paid services. One dependency swap — `@supabase/supabase-js` out, `pg` in — and indicators are written by hand rather than pulling in a library.

---

## 2. Proposed Solution & Implementation Plan

### 2.1 Why Neon

An earlier draft of this specification chose Supabase on the grounds that it was "already wired and in production use". That premise was false — the client code exists but no project was ever provisioned — so the decision was re-taken on the merits, against free-tier terms verified on 01.09.2026.

| | Neon Free | Supabase Free |
|---|---|---|
| Projects per account | **100** | 2 active |
| Storage | 0.5 GB **per project** | 500 MB per project |
| Compute | 100 CU-h **per project**, autoscaling to 2 CU / 8 GB RAM | unmetered, but shared CPU / 500 MB RAM |
| Idle behaviour | scale-to-zero after 5 min, **auto-resumes in ~0.5 s** | **project pauses after 1 week, manual resume** |
| Branches | 10, copy-on-write | none |
| Backups | none (6-hour instant restore) | none |

Three properties decide it, and none of them is about what is already installed:

1. **Idle behaviour.** A Supabase project that goes a week untouched pauses and needs a human to resume it — and because `/api/signals` reads the same database, the pause takes the signals feed with it. Compounding: this spec's own scheduler is disabled by GitHub after 60 days of repository inactivity, so a quiet stretch would stop collection *and then* pause the database. Neon has no such state; the compute sleeps and wakes by itself.
2. **Quotas are per project.** Neon allows 100 projects, each with its own storage and compute bucket. Supabase allows two active projects per account in total, so this database would permanently occupy half of that allowance.
3. **Headroom for the analytical half.** 500 MB RAM is adequate for hourly writes and dashboard reads, but it is the constraint that bites on spec 012's HNSW index build and on percentile aggregates over a hundred thousand rows. Neon autoscales to 8 GB RAM for the seconds such a query runs.

At an hourly cadence across three assets, snapshots accumulate at roughly **60 MB per year** against the 0.5 GB limit — about eight years, and `raw jsonb` payload size, not row count, is what will actually decide when that runs out.

**Two operational constraints replace the Supabase pause:** compute is metered (100 CU-h per project per month, of which hourly collection uses roughly 15), and the free plan keeps only a 6-hour restore window with no automatic backups. Both are addressed in §5.

### 2.2 Scheduling — GitHub Actions, not Vercel Cron

Vercel Cron is the obvious choice and it does not work here. **Hobby accounts are limited to cron jobs that run once per day**; an expression such as `0 * * * *` fails at deploy time with an explicit error, and Hobby scheduling precision is ±59 minutes regardless.

The scheduler therefore lives in **GitHub Actions**, which the repository already has available:

| Option | Hourly? | Cost | Verdict |
|---|---|---|---|
| Vercel Cron (Hobby) | ❌ daily only | $0 | Daily fallback only |
| Vercel Cron (Pro) | ✅ | $20/mo | Not justified for one endpoint |
| **GitHub Actions** | ✅ | $0 | **Chosen** |
| Claude Code Routine | ✅ (1h minimum) | $0 on subscription | Research preview, no SLA — unsuitable for the primary collector |

The workflow is a five-line `curl` to `/api/collect` carrying a shared secret. At roughly 15 seconds per run, 720 runs a month consumes about 3 hours against the 2,000 free minutes granted to private repositories.

Two GitHub Actions caveats to plan around:

1. Scheduled workflows are **best-effort** and can be delayed by minutes under platform load. Snapshots must therefore be keyed on a **truncated hour derived server-side**, not on the moment the workflow happened to fire, or the same hour can land twice with different timestamps.
2. Scheduled workflows are **automatically disabled after 60 days without repository activity**. A commit resets the clock; a note belongs in the README.

A daily `vercel.json` cron is kept as a safety net, so a lapsed Actions schedule degrades to daily collection rather than to silence.

### 2.3 Data sources

Every source below is free and unauthenticated. This is the finding that removes the need for a paid Coinglass subscription: the public Binance futures API supplies positioning data directly.

| Data | Endpoint | Notes |
|---|---|---|
| OHLCV, 4 timeframes | `GET fapi/v1/klines` | `limit=200` per timeframe; enough for RSI(14) and MA99 |
| Funding rate (current) | `GET fapi/v1/premiumIndex` | `lastFundingRate` |
| Funding rate (history) | `GET fapi/v1/fundingRate` | 24h delta |
| Open interest | `GET fapi/v1/openInterest` | Contracts; multiply by mark price for USD |
| Open interest history | `GET futures/data/openInterestHist` | **~30-day retention — not back-fillable** |
| Long/short ratio | `GET futures/data/globalLongShortAccountRatio` | `period=1h` |
| Liquidations | `wss !forceOrder@arr` | Streamed, so out of scope for a stateless hourly pull — see §5 |
| ETF net flows | `farside.co.uk/eth/`, `/btc/` | HTML table parse; ETH and BTC only |
| Fear & Greed | `api.alternative.me/fng/?limit=30` | Market-wide, not per-asset |
| Spot price, market cap | CoinGecko via existing `src/lib/coingecko.ts` | Reuse, do not duplicate |

Binance futures endpoints are subject to weight-based rate limits. Four timeframes × three assets is twelve `klines` calls per run plus roughly nine metadata calls — trivially inside the limits, but the collector should still fetch per-asset sequentially and per-source in parallel, and treat any non-200 as a missing field rather than a run failure.

### 2.4 Indicator layer — `src/lib/indicators.ts`

Pure functions, no I/O, no dates, no randomness. Kept pure for the same reason `src/lib/projectionSeries.ts` was in spec 009: unit tests can be added later without touching anything that calls them.

| Function | Responsibility |
|---|---|
| `rsi(closes, period = 14)` | Wilder's smoothing, matching TradingView's default |
| `sma(closes, period)` | Used for MA7 / MA25 / MA99 |
| `atr(highs, lows, closes, period = 14)` | Feeds expected-range reasoning in later specs |
| `zScore(values, lookback = 20)` | Volume anomaly detection |
| `pctFrom(price, reference)` | Distance from a moving average, in percent |
| `structure(highs, lows, lookback)` | Classifies `'HH-HL' \| 'LH-LL' \| 'RANGE'` |

The cost argument for computing these here rather than in the model is concrete: a snapshot of raw candles across four timeframes runs to roughly **80,000 tokens**, while the computed snapshot is about **8,000**. It also removes a class of arithmetic error from the model's responsibilities.

### 2.5 Snapshot assembly — `src/lib/snapshotBuilder.ts`

```
buildSnapshot(symbol, hourTs)
  → fetch all sources in parallel, each wrapped so a rejection yields null
  → compute indicators from the klines that did arrive
  → assemble typed fields + a `raw` jsonb payload of everything gathered
  → return a MarketSnapshot; the caller writes it
```

The `raw` column matters more than it appears. Typed columns carry only what is filtered or aggregated in SQL; everything else lands in `raw`. A new data source can therefore be added to the collector without a migration, and spec 012 can promote a field to a typed column later once it is known to be needed.

Field-level failure is explicitly allowed by AC 2.2: a snapshot missing ETF flows is still a valid snapshot. Run-level failure is not silent — the endpoint returns a per-source status object so a persistently broken parser is visible in the Actions log rather than quietly writing nulls forever.

### 2.6 Forecast persistence

Inside the `unstable_cache` callback in `src/app/api/projections/route.ts`, after `generateForecast()` returns:

```ts
void persistForecasts(projections, marketData).catch((e) =>
  console.error('[forecast-persist]', e),
);
```

Deliberately not awaited. AC 2.6 requires that an unreachable database cannot degrade the dashboard, and a Neon compute resuming from scale-to-zero takes roughly half a second. The write is fire-and-forget with an explicit `.catch`, so a rejection is logged rather than becoming an unhandled rejection.

`prompt_version` is stored alongside each forecast and must be bumped whenever a provider prompt changes. Without it, a prompt edit silently pollutes the historical record and spec 011's accuracy metric stops meaning anything.

### 2.7 Endpoint security

`/api/collect` mutates the database and calls external APIs, so it must not be publicly invocable (AC 2.6). It requires a `CRON_SECRET` bearer token, compared with a **timing-safe** comparison. The GitHub Actions workflow supplies it from repository secrets; the Vercel fallback cron supplies it from an environment variable.

---

## 3. Data Model

Full SQL lives in `db/migrations/0001_analytics.sql`. Shape and reasoning:

| Table | Purpose | Key details |
|---|---|---|
| `assets` | Symbol ↔ Binance pair ↔ CoinGecko id | Seeded with BTC, ETH, SOL |
| `snapshots` | One row per asset per hour | `UNIQUE (asset_id, ts)` — this is what makes re-runs idempotent (AC 2.2). Typed indicator/derivative/flow columns plus `raw jsonb`. BRIN index on `ts`; btree on `(asset_id, ts DESC)`; btree on `(asset_id, rsi_1d)` for AC 2.5's regime queries |
| `forecasts` | One row per coin per generation | FK to `snapshots`; `scenarios jsonb`; `model`, `prompt_version`, `source`; token counts and `cost_usd`. A trigger rejects scenario probabilities that do not sum to 1 ± 0.02 (AC 2.5) |
| `outcomes` | Created empty; filled by spec 011 | `UNIQUE (forecast_id)`; `actual_return_pct` is a generated column |

`outcomes` is created here rather than in spec 011 so the schema is migrated once and spec 011 is a code-only change.

### 3.1 Nullability

Every derivative and flow column is nullable. This is a requirement, not an oversight: AC 2.2 states that a snapshot missing one source is still stored with the absent fields empty. `NOT NULL` is reserved for `asset_id`, `ts` and `price` — a snapshot without a price is not a snapshot.

---

## 4. Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | server | **New** — Neon **pooled** connection string (the host contains `-pooler`); never exposed to the client bundle |
| `CRON_SECRET` | server + GitHub secret | **New** — authenticates `/api/collect` |
| `COLLECT_ENDPOINT` | GitHub secret | **New** — deployed URL the workflow calls |

`DATABASE_URL` grants full access to the database. It is server-only and must remain so; no collector or `db` module may be imported from a client component. Use the **pooled** endpoint — a direct endpoint will exhaust its connection limit under Vercel's serverless concurrency.

---

## 5. Risks and Deferrals

| Risk | Mitigation |
|---|---|
| **Liquidations need a WebSocket** — `!forceOrder@arr` is a stream, and there is no stateless hourly REST equivalent | Deferred. The column exists and stays null. A separate always-on aggregator is out of scope for a Vercel-hosted app; revisit if the field proves necessary for spec 012's vector |
| **Farside is an HTML table, not an API** — layout changes will break the parser | Parse defensively, return null on shape mismatch rather than throwing. Surface the per-source status so breakage is visible. Covers ETH and BTC only; SOL ETF flow is null by nature |
| **Neon free tier meters compute — 100 CU-h per project per month** | Hourly collection uses roughly 15 CU-h. Autoscaling to 2 CU burns the budget eight times faster, so a runaway analytical query is the only realistic way to exhaust it — watch it during spec 012's index builds |
| **No automatic backups; instant restore covers 6 hours only** | Weekly `pg_dump` into a private repository (Slice 7). This is not optional — a dropped table is otherwise unrecoverable |
| **GitHub Actions disables schedules after 60 days of repo inactivity** | Vercel daily cron as fallback; note in README |
| **Actions schedule drift causes duplicate hours** | Truncate the timestamp server-side and rely on `UNIQUE (asset_id, ts)` with an upsert |
| **Fear & Greed is market-wide, not per-asset** | Stored on every snapshot regardless; consumers must not read it as an ETH-specific signal |
| **`npm run daily-analysis` points at an empty directory** | Either implement `src/scripts/daily-analysis.ts` as a local manual trigger of the same builder, or delete the script. Decided in Slice 7 |

---

## 6. Verification Approach

Consistent with spec 009: automated tests are skipped, no test runner is configured. Each slice is gated on `npx tsc --noEmit` plus a manual check.

Because this specification has no UI, "manual walkthrough in `npm run dev`" is replaced by **querying the database**. Each slice's verification names the row or value that must be present afterwards, checked in the Neon SQL Editor or with `psql "$DATABASE_URL"`. `src/lib/indicators.ts` is kept pure so unit tests can be added later without touching the collectors.
