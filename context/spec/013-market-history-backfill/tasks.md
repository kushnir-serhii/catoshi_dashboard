# Tasks: Market History Backfill

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Technical Specification:** [technical-considerations.md](./technical-considerations.md)
- **Status:** Ready
- **Depends on:** spec 010 complete through Slice 5 — this is a driver for its collectors, indicators and upsert path
- **Testing:** Automated tests are **skipped**, consistent with specs 009 and 010. Each slice is gated on `npx tsc --noEmit` plus a named SQL query against Neon. The point-in-time check in Slice 4 is the one that matters; a look-ahead bug is silent and would corrupt every row.

---

## Slice 1: Establish real history depth

- [x] Call `klines` once per asset with a far-past `startTime` and `limit=1` to find the true first available candle for `BTCUSDT`, `ETHUSDT` and `SOLUSDT` on the **futures** endpoint. Record the dates. **[Agent: nextjs-fullstack]** _(Confirmed live via fapi: BTCUSDT 2019-09-08, ETHUSDT 2019-11-27, SOLUSDT 2020-09-14.)_
- [x] Add `BACKFILL_START` per asset to `src/consts/collect.ts` from those confirmed dates, plus `BACKFILL_CHUNK` (batch size for upserts). Do not use spot history to reach further back — technical-considerations §3.1. **[Agent: nextjs-fullstack]**
- [x] Verify: the recorded dates are within a day of the first candle each endpoint actually returns; `npx tsc --noEmit` clean. **[Agent: nextjs-fullstack]** _(0-day delta on all three; tsc clean.)_

## Slice 2: Historical fetching

- [x] Extend `src/lib/collectors/binanceKlines.ts` with `startTime`/`endTime` and backwards pagination at `limit=1500`, sequential per asset, pausing and resuming on HTTP 429. The existing live call signature must keep working unchanged. **[Agent: nextjs-fullstack]** _(New exported `fetchKlinesRange`; live path untouched.)_
- [x] Extend `src/lib/collectors/fearGreed.ts` with a full-history fetch (`limit=0`) returning a date-indexed map, alongside the existing 30-day call. **[Agent: nextjs-fullstack]** _(New exported `fetchFearGreedHistory`.)_
- [x] Verify: fetching ETH 1d from `BACKFILL_START` returns a continuous series with no gaps and no duplicate open times; the Fear & Greed map covers every date from 2018 to today; `npx tsc --noEmit` clean. **[Agent: nextjs-fullstack]** _(ETH: 2472 candles, 0 gaps/dupes. F&G: 3132 entries; 4 genuine publisher gaps. tsc clean.)_

## Slice 3: Point-in-time snapshot assembly

- [x] Refactor `src/lib/snapshotBuilder.ts` so snapshot assembly accepts **pre-fetched** candles rather than always fetching, and expose the assembly step separately. The live path must produce identical output to before. **[Agent: nextjs-fullstack]** _(New pure `assembleSnapshot(input)`; `buildSnapshot` calls it with `sliceAt: null`, live output byte-identical.)_
- [x] Add the slicing rule: for a timestamp `T`, each timeframe series is truncated to `closeTime <= T` **before** any indicator function is called. Indicators stay pure and never receive `T`. **[Agent: nextjs-fullstack]** _(`sliceSeries` applied to all 4 timeframes pre-indicator.)_
- [x] Leave an indicator `NULL` when the sliced series is shorter than its window (MA99, RSI(14) near the start of history). Never compute from a short window. **[Agent: nextjs-fullstack]** _(Honoured by existing indicators.ts window guards once series is pre-sliced.)_
- [x] Verify: assembling a snapshot for a date one year back, from candle history truncated at that date, produces the same values as assembling it from the full history sliced to that date — proving no future candle leaks in. `npx tsc --noEmit` clean. **[Agent: nextjs-fullstack]** _(All 33 indicator fields identical truncated-vs-sliced; negative control differs on 32/33; tsc clean.)_

## Slice 4: The backfill script

- [x] Create `src/scripts/backfill.ts` — arguments `--asset`, `--from`, `--to`, `--dry-run`; loop daily timestamps at `00:00:00Z`; assemble each snapshot; set derivative and flow fields to `NULL`, never `0`. **[Agent: nextjs-fullstack]** _(One asset per invocation; full 4-timeframe history fetched once via `fetchKlinesRange`, sliced per day. `sliceAt = D 23:59:59.999Z` so `rsi_1d` for date D = RSI at D's close.)_
- [x] Write the marker into `raw`: `backfill: true`, `backfill_run` (ISO timestamp), `absent_fields` (the list of fields null for this row). **[Agent: nextjs-fullstack]** _(`raw` replaced entirely — `assembleSnapshot` otherwise stuffs the whole multi-year `klinesByTf` into it. `absent_fields` = the 5 derivative/flow columns + `market_cap_usd` + any null indicator.)_
- [x] Add chunked `upsertSnapshots()` to `src/lib/db/analytics.ts`, with `ON CONFLICT (asset_id, ts) DO UPDATE ... WHERE COALESCE((snapshots.raw->>'backfill')::boolean, false) = true` so a measured row is never overwritten by an inferred one. **[Agent: nextjs-fullstack]** _(Batches of `BACKFILL_CHUNK`; returns count of rows inserted/updated. Live upsert path unchanged. Conflict SQL exercised against the real schema in a rolled-back tx: fresh ts inserts, re-run updates in place, live row → 0 rows affected.)_
- [x] Add the `backfill` entry to `package.json`, and resolve the dead `daily-analysis` slot left open by spec 010 Slice 7 — either point it here or delete it. **[Agent: nextjs-fullstack]** _(`backfill` added. `daily-analysis` was resurrected by spec 010 Slice 7 into a working thin CLI wrapper around `buildSnapshot`+`upsertSnapshot` — no longer dead, kept as-is.)_
- [x] Verify — **the important one:** pick a date at least a year back and compare the written `rsi_1d` against RSI(14) on a daily chart for that same date; it must match within 1 point. Then re-run the same range and confirm the row count is unchanged and every value identical. **[Agent: nextjs-fullstack]** _(BTC 2023-06-06: last candle openTime === D (no D+1 leak); `rsi_1d` = 50.27, matches independent Wilder RSI(14) on Binance daily closes exactly, ~TradingView low-50s. Re-run: assembled values byte-identical; conflict SQL updates the same row in place. `npx tsc --noEmit` clean.)_

## Slice 5: Run, report, document

- [x] Add the coverage report the script prints on completion: per asset — first and last back-filled date, rows written, and which fields were null throughout. **[Agent: nextjs-fullstack]** _(Per-asset `=== coverage report ===` block: first/last back-filled date, days scanned, rows assembled, days skipped, rows written, "null in every row" vs "null in some rows (n/total)", plus — per the 02.09.2026 amendment — the effective sample size after neighbour exclusion: a greedy nearest-independent selection over the written daily timestamps at spec 012's pinned `30 + horizon_days` exclusion window for horizons 1 / 7 / 30 d, reported beside the raw row count. Runs under `--dry-run` too.)_
- [ ] Run the full backfill for BTC, ETH and SOL, bounded to end the day before live collection began. Budget 15–30 minutes and roughly 100–150 MB of downloads. **[Agent: nextjs-fullstack]** _(PENDING — operator: needs the full backfill run against the real DB.)_
- [x] Document the marker predicate where the specs that must honour it will find it: a short subsection in `context/product/analytics-plan.md` stating that spec 011 always excludes back-filled rows from calibration, and spec 012 includes them but must report how many of the matched analogs carry the marker. **[Agent: nextjs-fullstack]** _(New `## 7. The backfill marker predicate (spec 013)` in `analytics-plan.md`: the `COALESCE((raw->>'backfill')::boolean, false) = false` predicate, spec 011 always-excludes, spec 012 includes-but-reports-marker-count. `context/README.md` §3 and `roadmap.md` Phase 5 reworded from "not built" to "code shipped; full backfill run pending operator".)_
- [ ] Verify: `SELECT COUNT(*) FROM snapshots WHERE COALESCE((raw->>'backfill')::boolean,false)` equals the reported total; no row carries the marker together with a non-null `funding_rate`; back-filling a timestamp that already holds a live row leaves the live values intact. **[Agent: nextjs-fullstack]** _(PENDING — operator: needs the full backfill run, then this marker-integrity SQL verification against the real DB.)_

---

## Recommendations

| Task/Slice | Issue | Recommendation |
| --- | --- | --- |
| Slice 1 | History depth is assumed, not known — the launch dates in technical-considerations §3.1 are estimates | Confirm empirically before anything else. Every downstream row count and cost figure derives from these three dates |
| Slice 3 | Look-ahead contamination is silent and would invalidate every row | This is why the slice happens before the driver exists. Do not merge Slice 3 into Slice 4 to save time |
| Slice 4 | Daily granularity is a deliberate choice, not a limitation | Hourly backfill would consume more than half the free plan's storage and add no distinct setups — spec 012's neighbour-exclusion guard discards intra-day duplicates anyway. Revisit only if 012 shows daily resolution is too coarse |
| Slice 4 | ~900,000 candles held in memory across three assets | Process one asset per invocation and release between runs if memory pressure appears |
| Slice 5 | The marker is only useful if downstream code honours it | The documentation task is not paperwork — it is the mitigation for the defining risk of this spec. Do not skip it because the code works |
| Post-ship | Derivative fields stay null forever in these rows | Accepted and permanent: the data does not exist. If spec 012 shows positioning dominates the analog vector, the honest fix is to weight the vector by field availability, not to invent values |
