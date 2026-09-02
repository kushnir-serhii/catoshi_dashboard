# Tasks: Signals From Market State

Slices are ordered so that each one leaves the repository in a working state, and so the
first visible improvement lands before the rule layer is finished.

---

## Slice 1 — Stop the page lying (no database work)

The page currently cannot tell "quiet market" from "feed is dead", and reports a fresh
`lastUpdated` on every request regardless of whether anything was collected. This slice
is independent of everything else and can ship on its own.

- [x] `SignalsResponse` gains a field distinguishing "healthy, nothing to report" from `fetchError`. (`collectionHealthy?: boolean`)
- [x] `/api/signals`: set `dynamic = 'force-dynamic'` (or `revalidate = 0`) and delete `revalidate = 21600` — a 6-hour cache over an hourly feed (technical-considerations §1.3).
- [x] `/api/signals`: derive `lastUpdated` from the newest snapshot backing the response, not `new Date()` (§1.5).
- [x] `/api/signals`: derive `nextUpdate` from the collection interval, or drop the field (§1.4). (`ts + SIGNALS_COLLECTION_INTERVAL_MS`)
- [x] `SignalsPage`: render an explicit error state when `fetchError` is true — currently returned and ignored (§1.7).
- [x] `SignalsPage`: render an explicit "no signals right now" state, visually distinct from the error state.
- [x] Verify the three states by hand: DB unreachable, DB reachable with an empty table, DB reachable with rows. (All three confirmed via API contract + component render logic against the live DB; error vs "no signals" states are visually distinct — different heading text, colour, border. No headless browser configured, so verified at the props→JSX level, not a pixel screenshot.)

**Done when:** an empty Signals page explains itself instead of showing blank space.

---

## Slice 2 — The table

- [x] Add `db/migrations/0004_signals.sql` per the DDL in technical-considerations §2, including the `(asset_id, rule_id, snapshot_ts)` unique constraint and the recency index. `asset_id` is `bigint` — `public.assets.id` is an identity `bigint`.
- [x] Apply it: `node --env-file=.env.local scripts/migrate.mjs`. (Applied: `→ 0004_signals.sql … ok`, recorded in `schema_migrations`.)
- [x] Confirm the table exists and the FK to `public.assets` resolves. (11 cols, `signals_asset_id_fkey` → `assets`, indexes present.)
- [x] `/api/signals`: replace `select *` with an explicit column list (§6).
- [x] Fix the `SignalRow.id` type mismatch — the column is an identity `bigint`, the interface says `string` (§6).
- [x] Confirm the route now returns an empty-but-healthy response rather than `fetchError`.

**Blocks:** slices 3–5.

---

## Slice 3 — Rules

- [x] `src/consts/signals.ts`: add every threshold and the freshness window. Remove the unused `CLAUDE_SIGNALS_MODEL` (§1.2). Align `TRACKED_COINS` with `COLLECT_ASSETS` (functional-spec 2.5).
- [x] Decide whether `SIGNALS_COUNT` governs the query limit or is deleted — today it governs nothing (§1.6). (Kept; governs the Slice 5 read limit.)
- [x] `src/lib/signals/types.ts`: the `Signal` shape a rule returns, and the rule signature `(snapshot, previous) => Signal | null`.
- [x] Implement the ten rules from technical-considerations §4, one file each under `src/lib/signals/rules/`.
- [x] Every rule returns `null` when any input it needs is null — never substitutes 0, 50, or any other default (§4, null discipline; functional-spec 2.6).
- [x] Severity: normalised distance past threshold, clamped to 0..1.

**Done when:** every rule is a pure `(snapshot, previous) => Signal | null` function with no I/O, and a source outage (null field) drops only the signals that depend on it.

_Test suite skipped by request — rules stay pure and hand-testable, but no `signal-rules.test.ts` is written._

---

## Slice 4 — Writing signals

- [x] `src/lib/signals/generate.ts`: run every rule over a freshly written snapshot, catching per-rule failures.
- [x] `since_ts` carry-forward: reuse the previous hour's value when the same `(asset_id, rule_id)` fired then, else use `snapshot_ts` (§2).
- [x] Upsert on the unique constraint so re-running an hour is idempotent (functional-spec 2.2).
- [x] Call generation from `/api/collect` **after** snapshots commit (§5, ordering).
- [x] A throwing rule is logged and surfaced through `SourceStatus`, and never fails the collection run (§5, failure isolation).
- [x] Trigger a collection run and confirm rows appear with correct `snapshot_ts` and `since_ts`. (Live: 4 rows at 08:00Z, `since_ts = snapshot_ts` correct for first run.)
- [x] Run the same hour twice; confirm no duplicates. (count 4 = distinct 4; second run upserted in place.)

---

## Slice 5 — Reading signals

- [x] `/api/signals`: the `distinct on (asset_id, rule_id)` query from technical-considerations §3, bounded by the freshness window.
- [x] Order by `severity desc, snapshot_ts desc`, limited to the card count.
- [x] Resolve empty-vs-broken by also reading the newest `snapshots.ts` (§3).
- [x] `SignalItem` gains `since`; the API maps `since_ts` to it.
- [x] `SignalCard` shows the condition's duration, not just its timestamp.
- [x] Confirm a condition holding for many hours yields one card, not one per hour (functional-spec 2.3). (Live: synthetic 2nd hourly row collapsed to one card.)

**Done when:** the Signals page shows real, current, traceable signals.

---

## Slice 6 — Tidy the record

- [x] `context/spec/002-ai-market-signals-feed/functional-spec.md`: correct the status, un-tick the criteria that were never met, and point to this spec (functional-spec 2.7).
- [x] `CLAUDE.md`: describe the signals pipeline in the architecture section — it currently describes news RSS via `marketData.ts`, which is not what this builds.
- [x] `context/product/architecture.md`: same correction.
- [x] Note in the roadmap that news-sourced signals remain unbuilt and are scoped to a later spec.

---

## Deliberately not in any slice

- News RSS and LLM classification — a separate spec (functional-spec §3).
- Redesigning the card layout.
- Backfilling signals over historical snapshots.
- Calibrating thresholds — needs spec 011's scoring to be meaningful (§8.4).
- Widening `COLLECT_ASSETS` beyond BTC/ETH/SOL — spec 010's territory (§8.3).
