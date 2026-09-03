# context/ — the single source of truth for Catoshi

Everything an agent needs to finish this project is in this folder. It is written in
**English only**. Where any other document anywhere disagrees with this folder — a
Claude Project doc, a chat transcript, a comment in code — **this folder wins**.

Last reconciled: **03.09.2026**.

---

## 1. Read in this order

| Order | File | What it answers |
|---|---|---|
| 1 | `product/product-definition.md` | What Catoshi is, who it is for, what is deliberately **not** built |
| 2 | `product/roadmap.md` | Every feature, phased, from here to done |
| 3 | `product/decisions.md` | Decisions already taken, and the traps this project has already fallen into |
| 4 | `EXECUTION-PLAN.md` | The ordered queue of work, with entry and exit criteria per stage |
| 5 | `product/architecture.md` | How the system is built |
| 6 | `product/analytics-plan.md` | Data sources, indicator set, model costs, the calibration loop |
| 7 | `spec/NNN-*/` | The three-file specification for each numbered feature |

An agent starting cold should read 1–4, then open only the spec named by the current
stage in `EXECUTION-PLAN.md`.

---

## 2. Folder shape

```
context/
  README.md              ← you are here
  EXECUTION-PLAN.md      ← the runbook: what to build next, and how you know it is done
  product/
    product-definition.md
    roadmap.md
    decisions.md         ← decision log + known defects + anti-patterns
    architecture.md
    analytics-plan.md
  spec/
    NNN-slug/
      functional-spec.md          ← what and why, user-visible behaviour
      technical-considerations.md ← how, and which trade-offs were taken
      tasks.md                    ← vertical slices, each independently shippable
```

This is the AWOS convention (`.awos/templates/`, `.awos/commands/`). Do not invent a
different shape.

---

## 3. Spec register

| # | Spec | Status |
|---|---|---|
| 001 | Live Asset Prices — KPI Cards | Shipped |
| 002 | AI / Market Signals Feed | **Superseded by 014 and 015.** Historical only |
| 003 | AI-Powered Price Projections | Shipped |
| 004 / 005 | Historical Price Chart | Shipped (004 is an abandoned first attempt) |
| 006 | Asset List with Live Sparklines | Shipped |
| 007 | Real-Time Chart Ticker | Specced, **not built**. Lowest priority |
| 008 | HeroUI Component Migration | Shipped |
| 009 | Real-Data Price Projection Chart | Shipped |
| 010 | Market Snapshot Store | Shipped |
| 011 | Forecast Scoring + Models Explorer | Specced, **not built** |
| 012 | Historical Analogs (pgvector) | Specced, **gated** — see its Gate section |
| 013 | Market History Backfill | **In progress** — code shipped (backfill script, backwards klines / F&G fetch, chunked marker-aware upsert, per-asset coverage report with effective sample size after neighbour exclusion); the full BTC/ETH/SOL backfill run and the post-run marker-integrity SQL check are pending operator |
| 014 | Signals From Market State | Shipped — 16 rules, 473 tests |
| 015 | News Impact Classification | **In progress** — pipeline shipped (ingest/classify/publish in `/api/collect`, `kind='news'` signals, `?scope=` filter, Signals-page news cards); twenty-item prompt calibration read + real-run cost verification (Slice 7) pending first run against a deployed collector |
| 016 | Forecasting-Core Scope Trim | Shipped |
| 017 | Collection Reliability & Deployment | **In progress** — observability shipped (`/api/health`, `public.collector_status`, `src/lib/freshness.ts`, `docs/runbook.md`); pipeline-run verification, restore drill and deployment audit pending operator |
| 018 | Operator Workflows on GitHub Actions | **In progress** — three `workflow_dispatch` workflows shipped (`.github/workflows/backfill.yml`, `verify-backfill.yml`, `analog-gate.yml`), each writing its headline result to the job summary, plus runbook §8 documenting them; the pending backfill / marker-integrity / Gate runs (Slice 4) are dispatched by an operator or an agent with `gh` access. Exists because no agent execution environment can reach Binance, the Fear & Greed API or Neon (`decisions.md` §10) |

There is no spec 004-vs-005 ambiguity to resolve and no gap to fill: numbers are never
reused, and a reserved number that never got a spec does not exist as work.

---

## 4. Rules that apply to every spec in this folder

These are not style preferences. Each one was bought with a defect that shipped.

1. **A surface must never look healthy when its source is dead.** No mock fallback on
   error, no `new Date()` as a freshness stamp, no fabricated numbers standing in for
   measurements. See `product/decisions.md` §3.
2. **Never present a number the system did not measure.** If there is not enough data,
   render an explicit empty state, not a plausible figure.
3. **Anything an LLM asserts is stored with its `prompt_version`.** A prompt edit that
   is not versioned silently corrupts the accuracy record.
4. **Backfilled rows are labelled** (`raw->>'backfill' = true`) and excluded from every
   calibration sample. Otherwise the system learns from its own reconstruction.
5. **Any value used in two or more files goes in `src/consts/`** or `.env` /
   `.env.example`. No inline API keys, model names, asset ids or timings.
6. **Pure logic is separated from I/O** so it can be unit-tested — the pattern in
   `src/lib/indicators.ts` and `src/lib/signals/rules/`.

---

## 5. Working agreements for an agent running unattended

- Work one **slice** at a time, in the order `EXECUTION-PLAN.md` gives. A slice is done
  when its exit criteria in that file are met, not when the code compiles.
- After each slice: `npm run lint`, `npx tsc --noEmit`, and the slice's own tests.
- Update the checkbox in `product/roadmap.md` and the status line in `README.md` §3 in
  the same commit as the slice.
- If a stage's **entry criteria** are not met, do not start it. Skip to the next stage
  whose entry criteria hold, and record why in the commit message.
- If a gate says STOP (spec 012), stop and report. Do not build past a gate.
