# Functional Specification: Market History Backfill

- **Roadmap Item:** Projections & Models → **Historical Analogs** (enabler)
- **Status:** Draft
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Spec 010 starts the history clock. It does not wind it back.

From the hour collection begins, `snapshots` gains 72 rows a day. Spec 012 searches that table for historical analogs of the current market state and reports what followed — _"of 18 comparable setups, price rose in 7; median 7-day move −2.1%"_. With an empty table that feature returns nothing, and with three months of table it returns a handful of neighbours drawn from a single market regime, which is worse than nothing: it looks like evidence.

Spec 010 states, correctly, that derivatives history cannot be back-filled — Binance retains open-interest and long/short data for roughly 30 days. **That conclusion was then applied too broadly.** Price history can be back-filled: `klines` serves candles back to each contract's launch, and `alternative.me/fng/` serves the whole Fear & Greed series. Ten of the sixteen dimensions in spec 012's market-state vector — RSI across four timeframes, distance from three daily moving averages, ATR, volume z-score, Fear & Greed — derive from those two sources alone.

So the choice is not "wait or don't". It is: launch spec 012 against several years of price-shaped history, or against however many weeks have elapsed since 010 shipped.

**The correctness condition that makes this safe.** A back-filled row has no funding rate, no open interest, no long/short ratio, no ETF flow. In spec 012's vector those dimensions fall back to neutral defaults, so every historical row looks *positionally balanced* — including the ones that were violently one-sided. Left unmarked, the analog search would systematically retrieve "calm" historical states and report calm outcomes, and the calibration views in spec 011 would score forecasts against conditions that were never measured. Marking these rows, and honouring the mark everywhere they are read, is not a detail of this spec; it is the spec.

**Success looks like:** spec 012 ships against several thousand historical snapshots per asset instead of a few hundred; every one of them is identifiable as back-filled in a single predicate; and no calibration figure anywhere in the product is computed over a mixture of measured and inferred rows.

---

## 2. Functional Requirements (The "What")

This specification is infrastructure and is run by the developer, not the user. Requirement 2.5 is the exception — it is what the user must never see.

### 2.1 — Historical Snapshots Exist

**As the** product owner, **I want** market snapshots for each supported asset going back as far as the free data sources allow, **so that** analog search has something to search.

**Acceptance Criteria:**

- [ ] Daily snapshots exist for BTC, ETH and SOL from each contract's earliest available candle to the day before live collection began
- [ ] Each row carries the timestamp of the day it describes, normalised to `00:00:00Z`
- [ ] Re-running the backfill over a period already covered updates those rows rather than duplicating them
- [ ] A day for which candles are unavailable is skipped, not written with invented values

### 2.2 — Back-filled Rows Are Marked and Stay Marked

**As a** developer building specs 011 and 012, **I want** every back-filled row to be identifiable, **so that** measured and inferred history are never silently mixed.

**Acceptance Criteria:**

- [ ] Every row written by this process carries `raw->>'backfill' = 'true'`
- [ ] The marker also records which fields were unavailable at write time, not merely that the row is back-filled
- [ ] A single documented predicate distinguishes back-filled from live rows, and it appears in this spec's documentation for 011 and 012 to reuse
- [ ] Live collection never writes the marker, and never removes it from a row it upserts over

### 2.3 — Indicators Are Computed the Same Way as in Live Collection

**As a** developer, **I want** historical indicators produced by the identical code path as live ones, **so that** a historical row and a live row are comparable.

**Acceptance Criteria:**

- [ ] RSI, moving averages, ATR, volume z-score and structure come from `src/lib/indicators.ts` — the same functions spec 010 uses, called with the same parameters
- [ ] Each historical point is computed only from candles that closed **at or before** that point; no candle from the future of the row's timestamp contributes to it
- [ ] Fear & Greed is taken from the published value for that date, not interpolated
- [ ] Re-running the backfill over an unchanged period produces byte-identical values

### 2.4 — Missing Data Is Absent, Not Zero

**As a** developer, **I want** unavailable fields left empty, **so that** no downstream metric mistakes a default for a measurement.

**Acceptance Criteria:**

- [ ] Funding, open interest, long/short ratio, liquidations and ETF flow are `NULL` in back-filled rows, never `0`
- [ ] A timeframe with insufficient candle history for its indicator window yields `NULL` for that indicator, not a value computed from a short window
- [ ] The run reports, per asset, how many rows were written and which fields were null throughout

### 2.5 — Nothing User-Facing Changes

**As a** user, **I want** the dashboard unchanged, **so that** a maintenance script is something I never encounter.

**Acceptance Criteria:**

- [ ] No route, page or component is added or modified
- [ ] The backfill cannot be triggered over HTTP; it is a command-line script only
- [ ] Running it does not interfere with hourly collection — a concurrent collector run neither fails nor is overwritten

---

## 3. Scope and Boundaries

### In-Scope

- A one-off, re-runnable command-line script that writes historical `snapshots` rows
- Backwards pagination of `klines` across the four timeframes for BTC, ETH and SOL
- Full-history retrieval of the Fear & Greed index
- The `backfill` marker and its documented predicate
- A short section in this spec's technical document stating how specs 011 and 012 must filter on that marker
- Reporting per-asset row counts and null-field coverage after a run

### Out-of-Scope

- Any attempt to reconstruct funding, open interest, long/short ratio, liquidations or ETF flows for past dates — the data does not exist
- Sub-daily backfill granularity (see the technical document for why daily is sufficient, and what it would cost to change)
- Back-filling `forecasts` or `outcomes` — no forecast was made on those dates, and inventing one would corrupt every calibration figure in spec 011
- Changing the live collector, the schema, or any spec 010 behaviour
- Assets beyond BTC, ETH and SOL
