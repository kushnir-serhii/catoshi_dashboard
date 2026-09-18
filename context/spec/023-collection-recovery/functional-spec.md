# Functional Specification: Collection Recovery

Spec: 023-collection-recovery
Created: 2026-09-16
Stage in `EXECUTION-PLAN.md`: follows 017 (collection reliability) — this is 017's exit
criteria failing in production, not a new feature.

---

## 1. Overview and Rationale (The "Why")

Hourly collection has produced nothing since **2026-09-02T08:00:00Z**. As of 2026-09-16 the
newest snapshot is ~14 days old, `snapshots24h` is 0 for BTC, ETH and SOL, `/api/health`
returns 503 with `stale: true`, and the Signals page is permanently empty.

The failure is a single chain, not three bugs:

1. `fetchAllTimeframes` returns `klinesByTf['1d'] === null` for every asset on production.
2. `assembleSnapshot` derives `latestPrice` **only** from daily closes
   (`snapshotBuilder.ts`, `closesDaily`), so it throws
   `snapshotBuilder: no daily klines for asset N at <ts> — cannot derive price`.
3. `/api/collect` catches that per asset, `anyAssetSucceeded` stays `false`, and the route
   returns **502 by design** (`route.ts`, final `status` expression). The 502 is a symptom.
   Nothing crashed and nothing ran out of memory.
4. No snapshot row is written → `newestSnapshotTs` stays frozen → signals are generated only
   inside a collect run and only read back within `SIGNALS_FRESHNESS_HOURS` (3 h), so the feed
   is empty regardless of market conditions.

**Why it was never caught locally:** every layer between the failed fetch and the log line
discards the reason. `fetchKlines` turns any non-200 into a bare `null` without recording the
status code. `fetchAllTimeframes` resolves successfully with null entries, so
`settle('klines', …)` in `buildSnapshot` reports the klines collector as `ok: true` while it
returned nothing. `/api/health` therefore shows a green collector next to a 14-day-old
snapshot.

A second, independent failure: all three news feeds return `rss2json HTTP 422`. One free
third-party bridge is a single point of failure in front of three otherwise-healthy sources;
`news:classify` and `news:publish` are fine.

A third, cosmetic but corrosive: `SignalsPage` renders the banner "Data last updated 14d ago —
collection may be stalled" directly above an empty state that asserts "Collection is healthy
and up to date". The page contradicts itself on the same screen. `decisions.md` §3 exists
precisely to stop a surface presenting a dead source as a healthy one.

**This spec does not assume a root cause for (1).** The status code is not currently recorded
anywhere. Slice 1 is a gate: make the failure legible, read the real status from production,
and only then fix it.

---

## 2. Functional Requirements (The "What")

### 2.1 A failed upstream fetch states why

Every kline fetch failure carries its HTTP status (or `network` / `malformed`) into logs and
into `SourceStatus`. A collector that returned no usable data for any timeframe is never
reported as `ok: true`. `/api/health` must not show a green collector beside a stale snapshot.

### 2.2 One missing timeframe does not void the snapshot

A snapshot row requires a NOT NULL price. That price may come from the newest close of any
collected timeframe, in order `1d → 4h → 1h → 15m`. The snapshot records which timeframe the
price came from. Only when every timeframe is empty does the asset fail.

Indicators keep their existing contract: daily MAs, daily ATR, daily volume z-score and daily
structure stay `NULL` when daily candles are absent. They are never computed from a substitute
timeframe. `volume24hUsd` is a 24-hour figure or `null` — never a 15-minute volume.

### 2.3 The live kline path survives a single upstream refusal

Whatever Slice 1 finds, the live collector gets what the backfill path already has: rate-limit
awareness, and a second source behind the primary. A fallback source is marked in
`SourceStatus`, never silently substituted.

Constraint carried over from `consts/collect.ts` and spec 012: stored **history** is Binance
USDT-M futures only. Mixing spot and futures series corrupts the analog distance metric. A
spot fallback, if used, serves the live hourly price only and is never written by the backfill.

### 2.4 Hourly means hourly

`vercel.json` schedules `/api/collect` once a day (`0 5 * * *`) — the Hobby-plan fallback.
Hourly collection depends on the GitHub Actions `collect.yml` run and its `COLLECT_ENDPOINT` /
`CRON_SECRET` secrets. With only the daily cron firing, `SIGNALS_FRESHNESS_HOURS = 3` leaves
the feed empty 21 hours out of 24 even after the kline fix. The hourly path must be verified
green, not assumed.

### 2.5 An empty state never claims health it cannot verify

When the newest snapshot is past `SNAPSHOT_STALE_MINUTES`, no surface says collection is
healthy. The market-state empty state and the news empty state each have a stale variant.

### 2.6 News ingest does not depend on one free bridge

The three configured feeds are read from their own RSS/Atom endpoints. Per-feed isolation,
idempotent ingest and honest failure reporting are unchanged. A date that cannot be parsed
rejects the item; it never falls back to `now()`.

---

## 3. Scope and Boundaries

### In-Scope

- `src/lib/collectors/binanceKlines.ts` — failure visibility, rate-limit handling, fallback source.
- `src/lib/snapshotBuilder.ts` — price derivation order, honest klines `SourceStatus`.
- `src/lib/collectors/newsFeed.ts` — direct RSS parsing.
- `src/components/pages/SignalsPage.tsx` — stale-aware empty states.
- `vercel.json` — function region, only if Slice 1 proves a geo block.
- `docs/runbook.md`, `context/product/decisions.md` §8 — record the defect and its resolution.

### Out-of-Scope

- Spec 020 (scheduled forecast ingestion). It is healthy end-to-end as of 2026-09-16 14:15 UTC
  and takes its reference prices from live prices, not snapshots. Do not touch it.
- Backfilling the ~14 lost days. Decide separately, after collection is proven running again.
- Any change to signal thresholds or `SIGNALS_FRESHNESS_HOURS`. The feed being empty is a data
  problem; widening the window to hide it is the wrong fix.
- Paid data providers.

---

## 4. Acceptance

The spec is done when `/api/health` reports `ok` with a snapshot age under
`SNAPSHOT_STALE_MINUTES`, 24 hourly snapshots exist per asset over a full day, the Signals page
shows either real signals or a stale-free empty state, and news items appear without rss2json.

---
*Technical note, not financial advice.*
