# Functional Specification: Market Snapshot Store

- **Roadmap Item:** Projections & Models → **Models Explorer** (enabler)
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Catoshi produces AI forecasts and then throws them away.

`/api/projections` generates a forecast, holds it in `unstable_cache` for six hours, and serves it. When the cache expires the forecast is gone. The only durable copy is up to five snapshots in the individual user's browser (`IndexedDB catoshi-db`), which never leave that device and are deliberately discarded whenever `PROJECTION_SCHEMA_VERSION` changes. No forecast has ever been checked against what the market actually did.

The consequence is visible on the Models page today: it renders `src/data/models.ts`, a hardcoded table of models that do not exist (`Tabnet-Pro`, `OnChain-LSTM`, `Whale-Graph`) reporting accuracy figures that were never measured (`Ensemble accuracy 74.0%`, `184/258 hits`). Spec 009 was written because contradictory numbers on the projections chart destroy user trust in seconds. The Models page has the same defect one level deeper — the numbers are not merely wrong, the system they describe is fictional.

There is a second, quieter problem. The forecast prompt currently receives prices, history and sentiment, but nothing about **positioning** — how leveraged the market is, which side the crowd is on, whether money is flowing into spot ETFs. Positioning is precisely what turns a quiet range into a violent move, and a forecaster that cannot see it will keep mistaking compressed volatility for a ceiling.

This specification adds no user-visible feature. It builds the record: an hourly, structured, permanent account of what the market looked like, and a permanent copy of every forecast made against it. Specs 011 and 012 are what the user eventually sees; neither is possible without this.

There is a timing argument for doing it first. Derivatives history cannot be back-filled — Binance retains open-interest and long/short history for roughly 30 days. Scoring can be applied retroactively to any stored forecast, but **every week collection is delayed is a week of market history permanently lost**.

**Success looks like:** a developer can ask the database "what were funding, open interest and positioning on the day we forecast ETH would range between $2,400 and $2,550, and what did it actually do?" — and get an answer, for any forecast the product has ever made.

---

## 2. Functional Requirements (The "What")

This specification is infrastructure. Most requirements are written from the perspective of the product owner and of the developer building specs 011 and 012, because the end user does not observe this work directly. Requirement 2.6 is the exception — it is what the user must **not** notice.

### 2.1 — Every Forecast Is Preserved

**As the** product owner, **I want** every forecast the product generates to be stored permanently, **so that** it can be checked against reality later.

**Acceptance Criteria:**

- [x] Every successful forecast returned by `/api/projections` is written to durable storage, one record per coin
- [x] Each record keeps the full scenario payload, the confidence, the reasoning, the AI service and model, and the prompt version used
- [x] Each record is linked to the market conditions it was based on, so the two can never drift apart
- [x] Each record keeps the input and output token counts and the resulting cost
- [x] A forecast served from cache is **not** written a second time — one generation, one record

---

### 2.2 — Market Conditions Are Recorded on a Schedule

**As the** product owner, **I want** a structured snapshot of market conditions captured every hour, **so that** the product accumulates a history it can learn from.

**Acceptance Criteria:**

- [x] A snapshot is captured every hour for each of **BTC, ETH and SOL**
- [x] Each snapshot carries the timestamp it describes, not merely the time it was written
- [x] Two snapshots for the same coin and the same hour cannot both exist — re-running collection overwrites rather than duplicates
- [x] Collection continues on schedule without any machine of the author's being switched on (GitHub Actions hourly workflow + Vercel daily fallback are built and correct; the workflow has not yet run unattended on GitHub's infrastructure since the branch is not yet pushed/merged - confirm on first merge)
- [x] A snapshot that is missing one data source is still stored, with the absent fields empty rather than fabricated

---

### 2.3 — Positioning and Flow Enter the Record

**As the** product owner, **I want** each snapshot to include how the market is positioned and where money is flowing, **so that** forecasts stop being made blind to the conditions that actually drive large moves.

**Acceptance Criteria:**

- [x] Each snapshot records the perpetual funding rate and its change over 24 hours
- [x] Each snapshot records open interest and its change over 24 hours
- [x] Each snapshot records the long/short account ratio
- [ ] Each snapshot records 24-hour liquidations and which side was liquidated - **deferred, accepted.** The columns exist and stay NULL: liquidations require the `!forceOrder@arr` WebSocket stream, which has no stateless hourly REST equivalent (technical-considerations.md section 5). Revisit only if spec 012 shows the field carries weight in the analog vector.
- [x] Each snapshot records spot-ETF net flow for the latest day, the number of consecutive inflow or outflow days, and the seven-day total
- [x] Each snapshot records the Fear & Greed value
- [x] None of the above requires a paid subscription or an API key

---

### 2.4 — Indicators Are Calculated, Not Guessed

**As a** developer, **I want** technical indicators computed in application code, **so that** figures are reproducible and the AI is never asked to do arithmetic on raw candles.

**Acceptance Criteria:**

- [x] RSI and moving averages are computed for the 15-minute, 1-hour, 4-hour and daily timeframes
- [x] The distance of price from each daily moving average is recorded as a percentage
- [x] Average true range and a volume z-score are recorded
- [x] The same indicator functions produce the same values for the same input every time — no randomness, no clock dependence
- [x] Raw candle arrays are never sent to an AI model; only the computed snapshot is

---

### 2.5 — The Record Is Queryable and Traceable

**As a** developer building the Models Explorer, **I want** to reconstruct the full context of any past forecast, **so that** accuracy can be attributed to conditions rather than reported as a single opaque percentage.

**Acceptance Criteria:**

- [x] Any stored forecast can be joined to the exact snapshot it was generated from
- [x] Forecasts can be filtered by AI service, model and prompt version
- [x] Snapshots can be filtered by the indicator values they carry, so questions such as "every forecast made while the daily RSI was above 80" can be answered
- [x] Storing a forecast whose scenario probabilities do not sum to 1 is rejected, not silently accepted

---

### 2.6 — Collection Never Degrades the Dashboard

**As a** user, **I want** the dashboard to behave exactly as it does today, **so that** background data collection is something I never have to think about.

**Acceptance Criteria:**

- [x] If the database is unreachable, `/api/projections` still returns its forecast normally
- [x] If a data source is slow or down, the collector records what it has and moves on rather than hanging
- [x] Page load times on the projections, signals and markets pages are unchanged (no new synchronous work added to any existing page; forecast persistence is fire-and-forget and never awaited)
- [x] No new figure, panel or loading state appears anywhere in the interface as a result of this work
- [x] The collection endpoint cannot be triggered by an anonymous visitor

---

## 3. Scope and Boundaries

### In-Scope

- Database tables for assets, market snapshots, forecasts, and the outcomes that spec 011 will fill
- Hourly collection of market conditions for BTC, ETH and SOL
- New market inputs: funding rate, open interest, long/short ratio, liquidations, spot-ETF flows
- Indicator computation in TypeScript across four timeframes
- Write-through persistence of every generated forecast
- A scheduling mechanism that runs hourly without the author's machine being on
- Resolving the `npm run daily-analysis` script, which currently points at an empty directory
- Provisioning Neon and moving the existing `/api/signals` read onto it, so the product has one database and no silent mock fallback
- Correcting `context/product/architecture.md`, which documents CryptoPanic as the news source and documents no database at all

### Out-of-Scope

- **Scoring forecasts against outcomes** — spec 011
- **Rebuilding the Models Explorer page** and deleting `src/data/models.ts` — spec 011
- **Historical analog search and `pgvector`** — spec 012
- Feeding the newly collected positioning data into the forecast prompt — deferred to spec 011, so this spec can ship without changing forecast behaviour
- Any change to the projections chart, the signals feed, or the markets page
- Migrating the five existing IndexedDB snapshots — they remain a client-side convenience
- Assets beyond BTC, ETH and SOL
- User accounts, authentication, or per-user forecast history
