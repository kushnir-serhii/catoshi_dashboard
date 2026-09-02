# Technical Specification: Historical Analogs

- **Functional Specification:** `./functional-spec.md` — **read its §0 Gate first**
- **Status:** Approved, gated
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

A hand-built numeric feature vector per snapshot, a per-asset partial HNSW index over it, and
two SQL functions that search under the correctness guards. Statistics are computed in SQL,
close to the data; the application layer only formats them.

`catoshi-schema.sql` in the Claude Project is the **reference design** for `build_state_vec`,
`find_analogs` and `analog_summary`. Its column set does **not** match the shipped migrations
(`decisions.md` §8, defect 8). Read it for intent, then write the real DDL against the
migrations that exist.

**A hand-built vector, not a text embedding.** Market state is numeric. Embedding a textual
description of it discards magnitude, and magnitude is the whole signal. Each feature is
normalised to roughly comparable scale first — otherwise L2 distance is dominated by RSI
(0–100) and funding rate (~0.0002) contributes nothing at all.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Prerequisite: fix the ETF streak sign

`catoshi-schema.sql` describes `etf_streak_days` as signed. The collector returns an
**unsigned** counter with direction carried separately in `etfNetFlowUsd`. `build_state_vec`
computes dimension 16 as `etf_streak_days / 10` mapped into −1..1, assuming a sign the data
does not carry. The spec-014 rule reads it correctly, so nothing is broken today — this
detonates the moment a vector is built.

**Fix it before Slice 1.** Either make the stored counter signed, or compute the signed value
in the vector builder from `etfNetFlowUsd`. Whichever is chosen, write it down here and add a
test.

### 2.2 Data model

- `CREATE EXTENSION IF NOT EXISTS vector;`
- `snapshots.state_vec vector(N)`, where **N is decided by the Gate verdict, not assumed to be
  16**. If Verdict 3 applies and dimension reduction is the chosen exit, N is smaller and the
  dimensions kept are listed here with the leave-one-out evidence that selected them.
- Vector construction lives in **one** place. Prefer a SQL function so the index, the
  backfill and the live write cannot drift apart; if it lives in TypeScript instead, the SQL
  path must not exist at all.
- **Partial HNSW index per asset:**
  `CREATE INDEX ... ON snapshots USING hnsw (state_vec vector_l2_ops) WHERE asset_id = ...`
  HNSW does not know about `asset_id`, so a filtered query over a single global index
  post-filters and can under-fetch candidates — returning fewer neighbours than requested with
  no error. With a partial index the planner uses it directly.
- Index build wants RAM. This is one of the reasons for Neon over Supabase
  (`decisions.md` §2, reason 3). Build during a low-traffic window and expect autoscale.

### 2.3 Search functions

**`find_analogs(query_snapshot_id, k, horizon_days)`** returns neighbour ids and distances,
applying all three guards **inside the function**:

- exclusion window `30 + horizon_days` — as a parameterised interval, never a literal 30;
- look-ahead: `ts + horizon_days` must be in the past;
- causal: `ts < query.ts`.

Putting the guards in the function rather than at the call site is deliberate. A guard that
lives at the call site is a guard that a future call site forgets.

**`analog_summary(query_snapshot_id, k, horizon_days)`** returns neighbour count, share
positive, median forward return and the interquartile range.

Forward return is computed from stored prices at `ts` and `ts + horizon`, with an explicit
policy for a missing horizon row: nearest available within a tolerance, or exclude. Decide
it, write it here, and test it — an implicit choice here quietly changes every statistic.

### 2.4 Application layer

- `src/lib/analogs.ts` — thin: call the function, shape the result, apply the minimum-sample
  rule. No statistics in TypeScript; SQL is where the data is.
- `src/consts/analogs.ts` — `k`, horizons, minimum neighbour count, exclusion window base,
  the dimension list and normalisers. Per the constants rule.
- `ForecastContextPanel.tsx` — the analogs section, hidden below the minimum sample count.
- Prompt injection in the forecast path, **behind a `prompt_version` bump**.

### 2.5 What the falsification script already tells the implementation

From `decisions.md` §7 — these are conclusions about the method, established on synthetic data
with a known answer, and they constrain the design:

- **The null must be a circular shift**, not a t-test. Overlapping forward returns are
  strongly autocorrelated and a t-test on them lies. The circular shift preserves return
  autocorrelation and state-space geometry while breaking the correspondence — which is
  exactly the confounder (neighbours in state space clustering in time) that would otherwise
  manufacture a signal. Measured false-positive rate: 0–10% against a nominal 5%.
- **Dimensionality is the binding constraint.** The same strong signal at n = 800, k = 30 is
  detected at p = 0.015 in one dimension and is invisible (p = 0.43) in ten.
- **History length partially rescues it:** at ten dimensions, p = 0.61 at n = 800, 0.74 at
  n = 3,000, **0.005 at n = 8,000**. A daily backfill yields ~3,100 rows per asset; hourly
  yields ~70,000. **Do not read this as settling the resolution question.** That curve is
  denominated in near-independent samples, and intraday snapshots are near-duplicates the
  exclusion guard discards anyway — so hourly does not buy 24× the *effective* n. Spec 013
  ships daily; the power analysis in the Gate decides whether finer is worth buying, and if it
  is, 4-hourly comes before hourly. See `decisions.md` §7.1.
- **Bonferroni across the whole family** of statistics. Three statistics × three horizons is a
  multiple-comparison problem, and an uncorrected p-value here would be the most expensive
  kind of self-deception in the project.

---

## 3. Impact and Risk Analysis

**System Dependencies:** `snapshots` and the spec 013 backfill; Neon with `pgvector`; the
forecast prompt path and therefore spec 011's score series.

| Risk | Mitigation |
|---|---|
| **The feature ships and measures noise** | The Gate. It is not advisory |
| **A guard is removed later for performance** | Guards live inside the SQL function, each with a test that fails when it is removed |
| **HNSW under-fetches on a filtered query** | Partial index per asset; verify the plan uses the index and that k neighbours actually come back |
| **The `etf_streak_days` sign is baked into stored vectors** | §2.1, fixed before Slice 1, with a test |
| **Normalisation divisors silently decide feature importance** | Both schemes evaluated; the choice recorded with its evidence; leave-one-out analysis reported |
| **Prompt injection pollutes the score series** | `prompt_version` bump; forecasts before and after are never pooled |
| **A user reads base rates as a prediction** | Wording requirement 2.4; under Verdict 1 no directional claim is presented at all |
| **Index build exhausts free-tier compute** | Build in a low-traffic window; Neon autoscales to 8 GB; measure CU-h consumed against the 100/month budget |

**Reversibility:** moderate. The column and index are droppable; the `prompt_version` bump is
permanent in the record, which is correct — it marks a genuine change of system.

---

## 4. Testing Strategy

**Before implementation — the Gate.** Run `src/scripts/analog-falsification.ts` on real
history, including its power analysis. Record the verdict in the functional spec §0. No
implementation task starts before that line reads Verdict 1.

**Unit:** vector construction determinism; per-dimension normalisation bounds; null handling
that never becomes a zero; the ETF sign fix.

**SQL correctness — one test per guard, each written so it fails if the guard is removed:**

- A neighbour inside the exclusion window is not returned, at every horizon — including the
  30-day case where a plain 30-day window would wrongly admit it.
- A neighbour whose horizon has not elapsed is not returned.
- A neighbour later than the query is not returned.
- A query with fewer than the minimum eligible neighbours returns a count, and the UI hides.

**Performance:** `EXPLAIN` confirms the partial index is used; k neighbours actually returned;
latency measured on the full backfilled history, not on a sample.

**Statistical sanity, on real data before shipping:** run `analog_summary` on a random sample
of query snapshots and confirm the distribution of "share positive" is not degenerate — if
every query returns 100% or 0%, a guard has failed and the neighbours are the query.
