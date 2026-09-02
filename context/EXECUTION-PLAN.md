# Execution Plan — from here to done

This is the runbook. It orders every remaining piece of work in this project, with entry and
exit criteria for each stage, so an agent running inside the repository can carry it to
completion without asking what comes next.

Written 02.09.2026. If this file and a spec disagree about *what* to build, the spec wins.
If they disagree about *when*, this file wins.

---

## How to use this file

1. Find the first stage whose **exit criteria** are not all met.
2. Check its **entry criteria**. If they do not hold, skip to the next stage that is
   startable and record in the commit message why you skipped.
3. Open the spec named in that stage. Work its `tasks.md` slice by slice, in order.
4. After each slice: `npm run lint`, `npx tsc --noEmit`, the slice's own tests.
5. Tick the checkbox in `product/roadmap.md` and update the status in `README.md` §3 in the
   **same commit** as the slice.
6. A **GATE** means stop. Do not build past it without a recorded verdict.

Total remaining: **7 stages**, of which one is gated on evidence and one is optional.

---

## Dependency map

```
Stage 1  Truth pass ──────────────┐         (no dependencies — start here)
                                  │
Stage 2  Reliability ─────────────┤         (urgent: history is being lost)
                                  │
Stage 3  News signals ────────────┤         (needs a running collector)
                                  │
Stage 4  Backfill (daily) ────────┤         (independent of 3; can run in parallel)
                                  │
Stage 5  Scoring ─────────────────┤         (needs 2; better with 4)
                                  ↓
Stage 6  Analogs ═══ GATE ═══     (needs 4 and 5, plus a passing falsification test)
                                  ↓
Stage 7  Ticker (optional) ───────┘         (nothing depends on it)
```

---

## Stage 1 — The truth pass

**Specs:** 011 Slice 1, then 016 (all slices)
**Why first:** it is free, it depends on nothing, and until it is done every other stage adds
features to a product that misstates what it is. `decisions.md` §3 and §5.

**Entry criteria:** none. Start here.

**Work:**

1. **Spec 011, Slice 1** — delete `src/data/models.ts` and give `ModelsPage` a truthful
   "nothing measured yet" state. Ships alone. Do not pull the rest of spec 011 forward.
2. **Spec 016, all slices** — remove the Portfolio surface, remove auth affordances, rewrite
   the landing page, sweep.

**Exit criteria:**

- [ ] No invented number remains anywhere in the running app — no fictional models, no
      `74.0%` hit rate, no `$248,392` holding, no `$2.4B AUM`.
- [ ] `/portfolio` returns 404; no navigation entry points at it.
- [ ] Every landing-page sentence traces to a file in `src/`.
- [ ] Grep sweep clean per spec 016 Slice 4.
- [ ] `npm run build` succeeds.

---

## Stage 2 — Reliability

**Spec:** 017 (all slices)
**Why second, and why it is urgent:** derivatives history — open interest, long/short ratio,
liquidations — **cannot be backfilled**. Binance retains roughly 30 days. Every week the
collector is unproven is a week of history lost permanently. Price history backfills
(Stage 4); this does not.

**Entry criteria:** Neon reachable; `/api/collect` deployed.

**Work:** spec 017 slices 1–7, in order. Slice 1 is the urgent one — everything after it is
observability and hygiene.

**Exit criteria:**

- [ ] A full 24-hour window is complete for every tracked asset, with every gap explained.
- [ ] `GET /api/health` exists, reports per-asset freshness and per-collector last success,
      and returns non-OK when stale.
- [ ] Every freshness display reads from the data, never from render time.
- [ ] The weekly dump has been **restored once**, into a throwaway Neon branch, and the
      procedure is written down.
- [ ] Production deployment verified: env vars reconciled, `NEXT_PUBLIC_USE_MOCK_DATA=false`,
      no secret in the client bundle, `/api/collect` rejects an unauthenticated request in
      production.
- [ ] `docs/runbook.md` exists, with the manual checks dated.

---

## Stage 3 — News signals

**Spec:** 015 (all slices)
**Why here:** it is the feature that makes the Signals feed worth opening daily, and it is
the piece the product owner asked for by name. It needs a running collector (Stage 2) and
nothing else.

**Entry criteria:** Stage 2 exit criteria met — a collector that runs and is observable.

**Work:** spec 015 slices 1–7. Slices 1–3 spend no tokens; get them tested before slice 4
makes the first paid call.

**Exit criteria:**

- [ ] Articles ingest and de-duplicate; running collection twice inserts each once.
- [ ] Classified items carry scope (`market` or a tracked asset), direction, magnitude,
      horizon, confidence, rationale, `prompt_version`, model and measured cost.
- [ ] The Signals feed shows news alongside market-state signals, filterable by scope, with
      source links, and ages items by **publication time**.
- [ ] A classifier failure writes nothing and does not fail the collection run.
- [ ] Twenty items read by hand for **calibration** — `NEUTRAL` reachable, scope sensible,
      magnitude distinct from confidence. If everything is `HIGH` and directional, the prompt
      is wrong; fix, bump `NEWS_PROMPT_VERSION`, read twenty more.
- [ ] Measured monthly cost recorded against the ~$1 allowance.

---

## Stage 4 — Market history backfill

**Spec:** 013 (all slices), **as written — at daily resolution**
**Why:** it is what makes spec 012 testable at all.

**A note on resolution, because two documents disagree.** The falsification work points at
hourly; spec 013 argues for daily on storage and on effective sample size, and its second
argument is the stronger one — intraday snapshots are near-duplicates that the
neighbour-exclusion guard discards anyway. **Ship daily.** It is cheap and reversible, and it
is the only option that costs nothing if resolution turns out not to be the constraint. The
decision procedure is `decisions.md` §7.1; do not pre-empt it.

Independent of Stage 3. If two things can be worked in parallel, these are they.

**Entry criteria:** Stage 2 exit criteria met — do not backfill into a store you cannot prove
is being written correctly.

**Exit criteria:**

- [ ] Price-side history reconstructed from klines and the sentiment index at daily resolution.
- [ ] Every backfilled row labelled `raw->>'backfill' = true`.
- [ ] The six derivative dimensions are known and documented to be constant over backfilled
      history, and that fact is carried into any surface that displays a result derived from
      it.
- [ ] Backfilled rows are excluded from every calibration sample (this is spec 011's
      requirement 2.5 — verify it is honoured once both exist).
- [ ] Row counts per asset recorded, **and the effective sample size after neighbour exclusion
      measured** — not just the row count. Every argument about resolution turns on that
      number and nobody has measured it yet. Stage 6's gate needs it.

---

## Stage 5 — Scoring

**Spec:** 011, slices 2–6 (Slice 1 shipped in Stage 1)
**Why:** it is the product's core promise, and it is the measuring instrument. Without it,
spec 012 is unfalsifiable and spec 014's rule thresholds stay chosen by eye.

**Entry criteria:** Stage 2 met. Stage 4 not required, but scores are thin without stored
forecasts, so expect the Models page to sit in its empty state for a while — that is the
correct behaviour, not a bug.

**Exit criteria:**

- [ ] Multi-category Brier scoring implemented as pure, tested functions, with the no-skill
      baseline derived from each forecast's own scenario count. **0.667 for three scenarios,
      never the binary 0.25** (`decisions.md` §6).
- [ ] `/api/resolve` runs, is idempotent, and never fails the collection run.
- [ ] The forecast→snapshot link respects an age limit; beyond it, `snapshot_id` is null and
      the forecast is excluded from calibration.
- [ ] `forecasts.cost_usd` confirmed to be actually populated.
- [ ] The Models page shows only measured numbers, always beside the baseline, with the
      sample count and the exclusions, and an explicit insufficient-data state below the
      minimum.
- [ ] Every number on the Models page traces to a resolved forecast.

**Follow-on, once scores accumulate:**

- [ ] Re-derive spec 014's rule thresholds from evidence rather than convention
      (`decisions.md` §8, defect 3).
- [ ] Extend resolution to score **news signals** from Stage 3 — the columns for it already
      exist by then.

---

## Stage 6 — Historical analogs ═══ GATE ═══

**Spec:** 012 — read its §0 before anything else.

**Entry criteria:**

- [ ] Stage 4 complete (backfill in place at daily resolution, with the effective sample size
      after exclusion measured).
- [ ] `decisions.md` §8 defect 1 fixed: `etf_streak_days` sign. Building any vector before
      this bakes a sign the data does not carry into every stored row.

**The gate:** run `src/scripts/analog-falsification.ts` on real history, **including its power
analysis**. A run without the power analysis cannot distinguish "found nothing" from "could
not have found anything", and its verdict is not accepted. Record the verdict, with numbers,
in `spec/012-historical-analogs/functional-spec.md` §0.

| Verdict | Action |
|---|---|
| **1** — signal in dispersion, none in direction | Build, as a source of **range and base rates only**. No directional claim anywhere |
| **2** — nothing found, power adequate | **Stop.** Close 012 as rejected in `README.md` §3 and the roadmap. The project is then done after Stage 7 |
| **3** — nothing found, test blind to an injected signal | **Stop.** Only here does finer backfill resolution become worth buying, and then **4-hourly first**, not hourly (`decisions.md` §7.1). Record the exits considered — fewer dimensions, finer resolution, or both. Each is a new gate |

**Exit criteria (Verdict 1 only):** spec 012 slices 1–6 complete, every guard tested such that
the test fails when the guard is removed, and the prompt injection carried out behind a
`prompt_version` bump.

---

## Stage 7 — Real-time ticker (optional)

**Spec:** 007 (all slices)
**Why last:** nothing depends on it. It is polish.

**Entry criteria:** everything above done or explicitly parked.

**Exit criteria:**

- [ ] Live label on the chart for BTC/ETH/SOL, following the selected asset.
- [ ] Directional flash, respecting `prefers-reduced-motion`.
- [ ] Disconnect shows last-known-price with a "Reconnecting…" indicator; reconnect is
      automatic with backoff; no socket leaks across ten navigations.

---

## Definition of done for the project

Catoshi is finished when:

1. Every page shows only measured numbers, or an explicit empty state. **No exceptions.**
2. Collection has run unattended for a month, with the health endpoint green and one restore
   drill performed.
3. The Signals feed carries both market-state and classified news signals, scoped and aged
   correctly.
4. The Models page shows a real Brier score against its proper baseline, over a sample large
   enough to report, grouped by model and prompt version.
5. Spec 012 is either shipped under Verdict 1 or closed as rejected — **a recorded decision
   either way**, never left open.
6. `context/` describes what the code actually does, and the roadmap checkboxes match reality.

Anything beyond that is a new roadmap, not this one.

---

## Standing rules for the whole run

- One slice at a time, in order. A slice is done when its exit criteria are met, not when the
  code compiles.
- Never mark a roadmap item complete without the behaviour existing. That mistake has already
  been made once in this project — spec 002 was marked complete with every box ticked while
  the table it read from had never been created in any migration.
- If a surface can display a number, ask what it shows when its source is dead. This check has
  paid for itself three times (`decisions.md` §3).
- If you find a defect that is not in `decisions.md` §8, add it there before continuing.
- If a decision in `decisions.md` §1 seems wrong, say so and stop. Do not silently re-take it —
  that is precisely how the Supabase/Neon reversal happened, on a false premise, in fourteen
  minutes.
