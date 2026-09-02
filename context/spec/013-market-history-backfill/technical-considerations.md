# Technical Specification: Market History Backfill

- **Functional Specification:** [context/spec/013-market-history-backfill/functional-spec.md](./functional-spec.md)
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Everything this specification needs already exists after spec 010. `src/lib/indicators.ts` computes the indicators, `src/lib/collectors/binanceKlines.ts` fetches candles, `src/lib/db/analytics.ts` upserts snapshots. What is missing is a driver that walks backwards through time and calls them.

The script is deliberately **not** a Route Handler. It runs for tens of minutes, is executed by a human once per asset universe, and must never be reachable over HTTP (AC 2.5).

```
scripts/backfill.ts --asset ETH --from 2019-11-27 --to 2026-08-31
  → download the full candle history for all four timeframes, once, into memory
  → for each daily timestamp T in range:
      slice each timeframe to candles closed at or before T
      compute indicators from those slices only
      assemble a MarketSnapshot with derivative/flow fields null
      mark raw.backfill = true plus the list of unavailable fields
  → batch-upsert in chunks
  → print per-asset row count and null-field coverage
```

**Affected files:**

| File | Change |
|---|---|
| `src/scripts/backfill.ts` | **New** — the driver. This also resolves the dead `daily-analysis` script slot noted in spec 010 Slice 7 |
| `src/lib/collectors/binanceKlines.ts` | Modified — add `startTime`/`endTime` and backwards pagination; the live path is unchanged |
| `src/lib/collectors/fearGreed.ts` | Modified — add a full-history fetch (`limit=0`) alongside the existing 30-day call |
| `src/lib/snapshotBuilder.ts` | Modified — accept pre-fetched candles instead of always fetching, so the same assembly code serves both paths |
| `src/lib/db/analytics.ts` | Modified — add a chunked `upsertSnapshots()` for batches |
| `src/consts/collect.ts` | Modified — add `BACKFILL_START` per asset and `BACKFILL_CHUNK` |
| `package.json` | Modified — `backfill` script entry |

No new dependencies. No new services. No schema migration — `raw jsonb` was designed for exactly this (spec 010 §2.5).

---

## 2. Cost

The question this specification has to answer before it is worth building.

### 2.1 Money

**Zero.** Binance `klines` and `alternative.me` are unauthenticated and free; the writes land in the Neon project already provisioned in spec 010, inside its free plan.

### 2.2 Storage — the number that matters

A `snapshots` row is roughly 1.0–1.3 KB: about 35 numeric columns, plus the `raw` payload, plus row overhead, plus roughly a third again for indexes.

| Granularity | Rows (3 assets, ~6.5 years avg) | Storage | Share of Neon's 0.5 GB |
|---|---|---|---|
| **Daily (chosen)** | **~7,200** | **~12 MB** | **~2.4%** |
| Daily + 4h | ~43,000 | ~70 MB | ~14% |
| Hourly | ~170,000 | ~270 MB | ~54% |

Hourly backfill is rejected on this table alone: it would consume more than half the free plan's storage before live collection has written its first year.

> **Note added 02.09.2026.** This section was briefly overruled in favour of hourly, on the strength of the analog falsification study's power curve (power appears between n = 3,000 and n = 8,000; daily gives ~3,100 per asset). That reversal has been withdrawn, because the paragraph below is the better argument: the power curve is denominated in near-independent samples, and intraday near-duplicates do not add effective sample size. **Daily ships.** If the spec 012 power analysis later shows the test is blind even to an injected signal, the next step is **4-hourly**, not hourly. Procedure: `context/product/decisions.md` §7.1.

Daily is not merely the cheap option, it is the correct one. Spec 012 searches analogs on 7- and 30-day horizons and applies a neighbour-exclusion guard of roughly 14 days. Six snapshots within a single day are near-duplicates of one another and would be excluded by that guard anyway — they would inflate the row count without adding a single distinct historical setup.

### 2.3 Neon compute

Writing ~7,200 rows is seconds of work. The real consumption is the compute staying awake for the duration of the run: at 0.25 CU for 30 minutes, **~0.13 CU-h of the 100 CU-h monthly allowance**. Negligible, and it recurs only if the backfill is re-run.

### 2.4 Binance requests and wall-clock time

The daily row count is small, but each daily point needs indicators on all four timeframes, so the full 15-minute history has to be downloaded.

| Timeframe | Candles per asset (~6.5 yrs) | Requests at `limit=1500` |
|---|---|---|
| 15m | ~228,000 | ~152 |
| 1h | ~57,000 | ~38 |
| 4h | ~14,000 | ~10 |
| 1d | ~2,400 | ~2 |
| **Per asset** | **~300,000** | **~202** |
| **Three assets** | **~900,000** | **~600** |

At weight 10 per large-`limit` request against a 2,400-per-minute budget, ~600 requests is about **6,000 weight — three minutes at the floor**. With deliberate pacing and safety margin, budget **15–30 minutes of wall clock** for a full run, and roughly **100–150 MB downloaded**. Held in memory this is a few hundred megabytes; if that is uncomfortable, stream per asset and discard between assets.

### 2.5 Developer time

Half a day. The indicators, the fetcher and the upsert all exist; this is pagination, a time loop and batching.

### 2.6 What it actually costs

Not money and not quota — **the risk in §5.1**. A back-filled row that is not honoured as such downstream will silently corrupt every calibration figure in spec 011. The 12 MB is free; the discipline is not.

---

## 3. Proposed Solution & Implementation Plan

### 3.1 History depth — verify before building

Backfill can only reach as far as the perpetual contracts themselves. Approximate launch dates:

| Asset | Futures pair available from |
|---|---|
| BTCUSDT | ~September 2019 |
| ETHUSDT | ~November 2019 |
| SOLUSDT | ~September 2020 |

**These are estimates and must be confirmed empirically** — one `klines` call per asset with a `startTime` far in the past returns the true first candle. The confirmed dates become `BACKFILL_START` in `src/consts/collect.ts`.

**Spot history reaches further** (BTC and ETH to August 2017) and is explicitly **not** used. The live collector reads futures; mixing spot candles into the same table would put two different price series behind one column, and the discrepancy would land inside spec 012's distance metric where nobody would ever see it. Losing two years of history is the cheaper error.

### 3.2 Point-in-time correctness

The single defect that would invalidate the whole exercise is look-ahead: computing a row's RSI from candles that had not closed yet. The guard is structural rather than procedural — for each timestamp `T`, each timeframe series is sliced to `closeTime <= T` **before** it is handed to any indicator function, and the indicator functions themselves never see a timestamp. Since they are already pure (spec 010 §2.4), they cannot reintroduce the problem.

A related, quieter case: the earliest rows in range have too few preceding candles for MA99 or RSI(14). Those indicators must be `NULL`, not computed from a short window (AC 2.4). In practice this means skipping roughly the first 99 days of each asset's daily series, or writing them with partial indicators — the latter, since the fields are nullable by design.

### 3.3 The `backfill` marker

The marker lives in `raw`, so no migration is needed:

```
raw.backfill        = true
raw.backfill_run    = ISO timestamp of the run
raw.absent_fields   = ["funding_rate", "open_interest_usd", "long_short_ratio",
                       "liq_24h_usd", "etf_flow_usd", ...]
```

**The predicate that specs 011 and 012 must use:**

```sql
-- measured rows only
WHERE COALESCE((raw->>'backfill')::boolean, false) = false
```

Where each spec applies it:

- **Spec 011, calibration** — always. A forecast is only ever attached to a live snapshot, so any back-filled row appearing in a calibration join is a bug, and the predicate makes it visible instead of plausible.
- **Spec 012, analog search** — **not** by default. Excluding back-filled rows there would defeat the purpose of this spec. Instead, `find_analogs` must be honest about what it matched: return the count of back-filled rows among the neighbours, and the UI must not present a positioning-based conclusion drawn from rows that carry no positioning. This is the same discipline as the look-ahead guard already specified in 012.

### 3.4 Concurrency with live collection

Both paths upsert on `UNIQUE (asset_id, ts)`. The backfill writes daily timestamps at `00:00:00Z`; the collector writes hourly timestamps including `00:00:00Z`. They therefore collide exactly once per day per asset.

Resolution: the backfill's upsert must **not** overwrite a row it did not write. `ON CONFLICT ... DO UPDATE ... WHERE COALESCE((snapshots.raw->>'backfill')::boolean, false) = true` — a measured row always wins over an inferred one, whichever runs second. Bounding the backfill's range to end before live collection started makes the collision rare; the predicate makes it harmless.

---

## 4. Impact and Risk Analysis

**System dependencies:** spec 010 must be complete through Slice 5 — this specification is a driver for its components and has nothing to run against otherwise.

| Risk | Mitigation |
|---|---|
| **Back-filled rows treated as measured** — the defining risk. Neutral defaults for absent positioning make every historical state look balanced, so analog search retrieves calm setups and calibration scores against conditions never observed | The marker (§3.3), the documented predicate, and its per-spec application rules. Verified by a query, not by intention |
| **Look-ahead contamination** — an indicator computed from candles that had not closed | Slice the series before calling the indicator (§3.2); verify by recomputing a known date and comparing against the same date on a chart |
| **Spot/futures mixing** to gain two extra years | Explicitly rejected in §3.1. `BACKFILL_START` is bounded by the futures contract |
| **A partially completed run** leaves an unknown range covered | The script is idempotent and range-bounded; re-running a range is always safe. Report written ranges per asset at the end |
| **Binance rate limits** during a long run | `limit=1500`, sequential per asset, pause on HTTP 429 and resume; never parallelise across assets |
| **Memory** — ~900k candles held at once | Process one asset at a time and release between assets |
| **The marker survives nothing** — a future migration rewrites `raw` and the distinction is lost | Should the marker ever need to be load-bearing beyond spec 012, promote it to a typed `is_backfill boolean` column. Noted, not done now |

---

## 5. Testing Strategy

Consistent with specs 009 and 010: no test runner is configured, so each slice is gated on `npx tsc --noEmit` plus a named query.

- **Point-in-time correctness** — pick a date at least a year back; the row's `rsi_1d` must match RSI(14) on a daily chart for that date to within 1 point. This is the check that catches look-ahead, and it is the one worth doing carefully.
- **Determinism** — run the same range twice; row count unchanged and every value identical.
- **Marker integrity** — `SELECT COUNT(*) FROM snapshots WHERE COALESCE((raw->>'backfill')::boolean, false)` matches the reported written count, and no row carries both the marker and a non-null `funding_rate`.
- **Collision behaviour** — back-fill a timestamp that already has a live row; the live values must survive.
- **Coverage report** — per asset, first and last back-filled date, row count, and the null-field list.
