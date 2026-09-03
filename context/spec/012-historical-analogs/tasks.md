# Tasks: Historical Analogs

**Slice 0 is a gate, not a warm-up.** Slices 1–6 do not exist until it returns Verdict 1.

---

## Slice 0 — THE GATE

- [ ] Confirm spec 013 has run and the backfill is in place **at daily resolution, as spec 013 is written**. Measure and record the **effective** sample size after neighbour exclusion, not the row count — every argument about resolution turns on that number and nobody has measured it (`decisions.md` §7.1). Do not re-backfill finer before running the test; that is what the power analysis is for.
- [x] Fix `decisions.md` §8 defect 1 — `etf_streak_days` is unsigned in the collector but `build_state_vec` maps it as signed. Fix it and add a test **before** any vector is built anywhere, including in the test script. (Fixed in the vector builder via `signedEtfStreakDays()` in `analog-core.ts` — sign recombined from `etf_net_flow_usd`, collector and spec-014 rule untouched; test `src/scripts/analog-vector.test.ts`.)
- [ ] Run `src/scripts/analog-falsification.ts` on real history. It must include the **power analysis** — injecting a signal of known strength on the real state geometry. A run without it cannot distinguish "found nothing" from "could not have found anything", and its verdict is not accepted.
- [ ] Confirm the null is the circular shift and Bonferroni correction is applied across the whole family of statistics (3 statistics × 3 horizons).
- [ ] Record the verdict, with numbers, in `functional-spec.md` §0.

**Then:**

| Verdict | Action |
|---|---|
| **1** — signal in dispersion, none in direction | Proceed to Slice 1. Build as a source of **range and base rates only**. No directional claim anywhere in the UI or the prompt |
| **2** — nothing found, power was adequate | **Stop.** Close this spec as rejected in `README.md` §3 and the roadmap. Put the effort into spec 011 |
| **3** — nothing found, test blind to an injected signal | **Stop.** Not evidence that analogs do not exist — evidence that this many dimensions over this much history has no resolving power, and `find_analogs` would fail identically. Record the exits considered (fewer dimensions, more history, or both). Each is a new gate, not a licence to proceed |

**Do not start Slice 1 on a verdict of 2 or 3.**

---

## Slice 1 — Vector column and index

- [ ] `CREATE EXTENSION IF NOT EXISTS vector;` in a new migration (next free number).
- [ ] `snapshots.state_vec vector(N)` — **N comes from the Gate verdict**, not assumed to be 16. If dimension reduction was the chosen exit, list the retained dimensions here with the leave-one-out evidence that selected them.
- [ ] Vector construction in **one** place only. If it is a SQL function, no TypeScript path exists; if TypeScript, no SQL path exists. Two paths will drift.
- [ ] Decide normalisers: spec divisors vs per-column z-score. Record the choice **and its evidence** — under L2 these are feature weights, and the current divisors implicitly assert funding matters as much as RSI (`decisions.md` §7.5).
- [ ] Null handling: a null source column never becomes a zero. Either exclude the snapshot from the searchable set or mark the dimension absent.
- [ ] Partial HNSW index **per asset**: `USING hnsw (state_vec vector_l2_ops) WHERE asset_id = ...`. A single global index post-filters and can silently under-fetch.
- [ ] Backfill vectors for existing snapshots. Measure CU-h consumed against the 100/month Neon budget.
- [ ] Tests: construction determinism, per-dimension bounds, null handling, the ETF sign fix.
- [ ] `EXPLAIN` confirms the partial index is used and k neighbours actually come back.

---

## Slice 2 — Search functions, with the guards inside them

- [ ] `find_analogs(query_snapshot_id, k, horizon_days)` returning neighbour ids and distances.
- [ ] All three guards live **inside the function**, never at the call site:
  - exclusion window `30 + horizon_days`, parameterised — never a literal 30;
  - look-ahead: `ts + horizon_days` is in the past;
  - causal: `ts < query.ts`.
- [ ] `analog_summary(query_snapshot_id, k, horizon_days)`: neighbour count, share positive, median forward return, interquartile range.
- [ ] Decide and document the missing-horizon-row policy — nearest within tolerance, or exclude. An implicit choice here changes every statistic.
- [ ] One test per guard, each written so it **fails if the guard is removed**. Include the 30-day horizon case where a plain 30-day window would wrongly admit an overlapping neighbour.
- [ ] Latency measured on the full backfilled history, not on a sample.

---

## Slice 3 — Application layer

- [ ] `src/consts/analogs.ts`: `k`, horizons, minimum neighbour count, exclusion window base, dimension list, normalisers.
- [ ] `src/lib/analogs.ts`: call the function, shape the result, apply the minimum-sample rule. **No statistics in TypeScript** — SQL is where the data is.
- [ ] Statistical sanity check on real data: run `analog_summary` over a random sample of query snapshots. If "share positive" is degenerate — every query 100% or 0% — a guard has failed and the neighbours are the query. Do not proceed.

---

## Slice 4 — The UI surface

- [ ] Analogs section in `ForecastContextPanel.tsx`.
- [ ] **Hidden entirely** below the minimum neighbour count — not shown with a small-sample caveat.
- [ ] The text states the sample size, the period the history covers, and that over backfilled history the match is on **price dimensions only** (six derivative dimensions do not backfill and sit constant).
- [ ] Wording is never predictive: "of N comparable setups, price rose in M" — not "price is likely to rise".
- [ ] Under Verdict 1, no directional claim appears at all. Range and base rates only.

---

## Slice 5 — Prompt injection

- [ ] Inject analog base rates into the forecast prompt as explicit measured base rates **with their sample size**.
- [ ] **Bump `prompt_version`.** This changes the forecaster; scores before and after are different systems and must never be pooled (`decisions.md` §6).
- [ ] Below the minimum sample size, inject nothing. A weak base rate framed as a strong one is worse than none.
- [ ] Note the version boundary in spec 011's calibration view so the split is visible on the Models page.

---

## Slice 6 — Correct the record

- [ ] `context/product/architecture.md`: describe the vector, index and search functions.
- [ ] `context/product/decisions.md` §8: mark defect 1 (`etf_streak_days`) closed; append the Gate verdict as a settled decision.
- [ ] `catoshi-schema.sql` in the Claude Project: note which parts are now implemented and where the shipped DDL diverges from the reference design.
- [ ] Tick the Phase 6 checkboxes in the roadmap; update `README.md` §3.

---

## Deliberately not in any slice

- Trading signals or recommendations derived from analogs.
- Cross-asset analogs.
- Learned or text embeddings of market state.
- Automatic feature-weight learning — leave-one-out informs a human choice.
- Separate scoring of analog-informed forecasts. `prompt_version` grouping already separates them.
