# Decisions, Traps and Known Defects

Everything on this page was expensive to learn. It exists so no agent re-litigates a
settled decision, re-introduces a defect that has already shipped once, or trusts a
number that has already been shown to be fabricated.

Last reconciled: **02.09.2026**. This file supersedes any conflicting statement elsewhere.

---

## 1. Settled decisions — do not re-open

| Question | Decision | Date | Why it is settled |
|---|---|---|---|
| Database | **Neon Postgres** | 01.09.2026 | §2 below |
| Scheduler for hourly collection | **GitHub Actions** hourly, with a daily `vercel.json` cron as fallback | 01.09.2026 | §4 below |
| Tracked assets | **BTC, ETH, SOL** | 01.09.2026 | Matches `DEFAULT_FORECAST_TARGETS` and the seeded `assets` table |
| Intermediate state store | **None.** Write straight to Postgres | 01.09.2026 | Vercel KV was proposed before a database existed; it is redundant now |
| Indicator computation | **In TypeScript** (`src/lib/indicators.ts`), never in the model | 25.08.2026 | ~80k tokens of raw candles vs ~8k for a computed snapshot, and it removes a class of arithmetic error from the model's job |
| Signal source | **Market state** (spec 014), with **classified news** added alongside (spec 015) | 02.09.2026 | The original spec 002 design — LLM-classified headlines with no persistence and no scoreable claim — is superseded |
| Product scope | **Forecasting and signals only.** No portfolio, wallet, account or personal data | 02.09.2026 | `product-definition.md` §3.2 |
| Spec numbering | Sequential, never reused. A reserved number with no spec is not work | — | Spec 012 sat reserved-but-unwritten long enough to cause a wrong status call |

**Backfill resolution is NOT on this list.** It is genuinely open — see §7.1.

---

## 2. Why Neon, not Supabase

`catoshi-schema.sql` (25.08) proposed Neon. Spec 010 reversed it fourteen minutes later
in favour of Supabase, on the grounds that Supabase was "already wired and in production
use". **That premise was false.** The client code (`@supabase/supabase-js`,
`src/lib/supabaseClient.ts`) existed; the Supabase project never did. `/api/signals` had
been serving `mockSignalsResponse` since it shipped because it swallowed every error into
that fallback — which is how a database that did not exist looked like a working feed.

With the "already there" argument removed, the choice was retaken on merits, against free-tier
terms verified 01.09.2026:

| | Neon Free | Supabase Free |
|---|---|---|
| Projects per account | **100** | 2 active |
| Storage | 0.5 GB **per project** | 500 MB per project |
| Compute | 100 CU-h per project, autoscale to 2 CU / 8 GB RAM | not metered, 500 MB RAM |
| Idle behaviour | sleeps after 5 min, **wakes itself** | **pauses after a week, resumed manually** |
| Database branches | 10, copy-on-write | none |

Three reasons, none of them "what is already installed":

1. **It survives neglect.** Supabase pauses a free project after a week idle and needs a
   human to resume it. This project's own scheduler is disabled by GitHub after 60 days
   without commits — so a quiet stretch would stop collection *and then* pause the database.
   Neon's compute sleeps and wakes itself in about half a second.
2. **Quotas are per project, and there are 100 of them.** Supabase allows two active
   projects per account in total; this database would take half that allowance permanently.
3. **Headroom where the work is heavy.** Percentile aggregates over a hundred thousand rows,
   and spec 012's HNSW index build, want the autoscale to 8 GB RAM.

**Constraints to respect:**

- Compute is metered — hourly collection uses roughly 15 of 100 CU-h/month.
- **No automatic backups**, and only a 6-hour restore window. A weekly `pg_dump` is
  mandatory, not optional (spec 017).
- Serverless callers must use the **pooled** endpoint (`DATABASE_URL`, host contains
  `-pooler`). Migrations need a session-level connection: `DATABASE_URL_UNPOOLED`.

---

## 3. The project's recurring failure: a product that lies about itself

Three instances, each louder than the last. This is the single most useful pattern in the
codebase's history and the reason for the rules in `context/README.md` §4.

1. **`/api/signals` returned mocks on any error.** A database that never existed rendered
   as a working feed. Found while building spec 010.
2. **`lastUpdated` was set to `new Date()`.** The page looked fresh even if collection had
   died three days earlier. Found while building spec 014.
3. **`src/data/models.ts` is an entirely invented Models page** — six models that do not
   exist (*Tabnet-Pro*, *OnChain-LSTM*, *Whale-Graph*…), "ensemble accuracy 74.0%",
   "1,248 predictions/day", "training cycle 412", and forecasts for TAO/ARB/LINK, assets
   the collector does not even gather. `ModelsPage.tsx` renders all of it as measured.
   Found while writing spec 011.

The first two were error-handling accidents. The third is a page of invented statistics
about the system's own predictive ability — precisely the number a user would lean on
hardest. **Deleting `src/data/models.ts` is Slice 1 of spec 011 and the highest-value line
in it.** The landing page carries the same defect at marketing scale (§5) and is removed
by spec 016.

**The cheapest check in this project:** walk every remaining endpoint and page with one
question — *what does it show when its source is dead?* It has paid for itself three times.

---

## 4. Why GitHub Actions, not Vercel Cron or Claude Code Routines

| Option | Hourly? | Cost | Verdict |
|---|---|---|---|
| Vercel Cron (Hobby) | ❌ once daily only | $0 | fallback only |
| Vercel Cron (Pro) | ✅ | $20/mo | not justified for one endpoint |
| **GitHub Actions** | ✅ | $0 | **chosen** |
| Claude Code Routine | ✅ (1 h minimum) | $0 within subscription | research preview, no SLA — not for primary collection |

The workflow is five lines of `curl` to `/api/collect` with a shared secret. About 15
seconds per run; 720 runs/month ≈ 3 hours of the 2,000 free minutes.

Two hazards, both already handled in spec 010 and re-verified in spec 017:

1. **The schedule is best-effort and can drift by minutes.** The snapshot timestamp is
   therefore truncated to the hour **on the server**, never taken from the firing moment —
   otherwise the same hour lands twice under different `ts`.
2. **GitHub disables scheduled workflows after 60 days of repository inactivity.** A commit
   resets the counter. This note belongs in the README.

The daily `vercel.json` cron stays as insurance: a broken Actions schedule degrades to
daily collection rather than to silence.

**Where Routines are appropriate:** the weekly calibration review in spec 011 — no precise
schedule requirement, no SLA risk. Not for primary collection.

---

## 5. The landing page is the same defect at marketing scale

`src/components/landing/LandingPage.tsx` currently promises, in the product's own voice:

- "Ensemble of 5 models (Tabnet, LSTM, XGB, BERT, TFT)" — none exist.
- "Predictions / day: 1,248", "Hit rate · 90d: 74.0%", "AUM under projection: $2.4B across
  14k portfolios" — all invented, and the hit rate is the exact figure the product has no
  right to state until spec 011 measures one.
- "Link exchanges via read-only API or paste wallet addresses. Keys never leave the secure
  enclave" — there is no such capability and, per the new scope, there never will be.
- Three pricing tiers with a trial and a "Talk to sales" CTA — there is no billing.
- "Holdings analytics: cost basis, P&L per lot, allocation drift and tax-lot tracking" —
  out of scope by decision.

Spec 016 removes all of it. What survives is a description of what the product does.

---

## 6. The Brier threshold correction

**`analytics-plan.md` and the older project notes state that a Brier score below 0.25 means
the system is calibrated better than a coin flip. For this system that is wrong.**

0.25 is the reference point for the **binary** form of the Brier score. Catoshi's forecasts
carry **three or more scenarios** and use the multi-category sum `Σ(pᵢ − oᵢ)²`, whose range
is 0..2. The "I know nothing" baseline for three equiprobable scenarios is

```
3 × (1/3)² ... more precisely: (1/3−0)² + (1/3−0)² + (1/3−1)²  =  0.667
```

So **0.667 is the coin-flip line, not 0.25.** Judged against 0.25, a genuinely skilled
forecaster would be reported as failing.

Requirements that follow, and that spec 011 must implement:

- The baseline is computed from the **actual scenario count of each forecast**, not
  hardcoded. A four-scenario forecast has a different uninformed baseline than a
  three-scenario one.
- The UI shows **Brier skill score relative to that baseline**, not the raw number alone.
- Grouping is always by `model` + `prompt_version`. Anything else compares different systems.

---

## 7. Analog method: what the falsification test already established

Full write-up: this project's analog hypothesis work; code at `src/scripts/analog-core.ts`,
`analog-core.test.ts`, `analog-falsification.ts`. Findings on **synthetic data with a known
answer**, which are about the method, not the code:

1. **The null is calibrated.** The permutation null is a **circular shift** of the returns
   series against the state series — it preserves return autocorrelation and the geometry of
   the state space and breaks only the correspondence. On autocorrelated overlapping returns
   with no state relationship, the false-positive rate is 0–10% against a nominal 5%. A
   t-test here would lie, because overlapping forward returns are strongly autocorrelated.
2. **The curse of dimensionality is measurable.** The same strong volatility signal, n = 800,
   k = 30, varying only the number of dimensions:

   | Dimensions | dispersionRatio (null) | p |
   |---|---|---|
   | 1 | 0.597 (0.927) | **0.015** |
   | 2 | 0.799 (0.952) | 0.119 |
   | 3 | 0.787 (0.916) | 0.234 |
   | 5 | 0.956 (0.927) | 0.572 |
   | 10 | 0.947 (0.954) | 0.433 |

   At 10 dimensions the method is blind to a signal that is obvious at 1.

3. **History length partially rescues it.** 10 dimensions, same signal: p = 0.61 at n = 800,
   0.74 at n = 3,000, **0.005 at n = 8,000**.

   A daily backfill from 2018-02 yields ~3,100 rows per asset — the zone with no power in this
   table. An hourly backfill yields ~70,000. **This looks like a decisive argument for hourly.
   It is not — see §7.1.**

4. **The normalisation divisors in `build_state_vec` (`/20.0`, `/50.0`, `/0.001`) are feature
   weights in disguise.** Under L2 distance they implicitly decide that funding matters as
   much as RSI. The script computes both spec normalisers and plain per-column z-scores so the
   difference is visible.

Six derivative dimensions do not backfill and sit at COALESCE defaults — constant — so the
historical test is effectively a test of **10 price dimensions**. That is also what
`find_analogs` will have over history.

## 7.1 OPEN: backfill resolution — daily, 4-hourly, or hourly

Two documents in this project reach opposite conclusions, neither acknowledging the other.
**This was recorded as settled in favour of hourly on 02.09.2026. That was wrong, and the
entry has been withdrawn.** Both arguments have force:

**For hourly** (from the falsification work, §7.3 above): at ten dimensions, power appears
between n = 3,000 and n = 8,000. Daily gives ~3,100 rows per asset; hourly gives ~70,000.

**For daily** (spec 013, technical considerations §2.2, and this is the stronger half):

| Granularity | Rows (3 assets, ~6.5 y) | Storage | Share of Neon's 0.5 GB |
|---|---|---|---|
| Daily | ~7,200 | ~12 MB | ~2.4% |
| Daily + 4h | ~43,000 | ~70 MB | ~14% |
| Hourly | ~170,000 | ~270 MB | ~54% |

1. **Storage.** Hourly consumes more than half the free plan before live collection writes its
   first year.
2. **Effective sample size, not row count.** Twenty-four snapshots inside one day are
   near-duplicates. The neighbour-exclusion guard removes them around any query anyway, so
   hourly does **not** buy 24× the effective n — and effective n is what the power curve in
   §7.3 is denominated in. That curve was measured on near-independent synthetic samples;
   reading it against a row count of autocorrelated intraday duplicates overstates the gain,
   possibly by an order of magnitude.

**How to resolve it — by evidence, not argument:**

1. Ship spec 013 **as written, at daily**. It is cheap, it is reversible, and it is the only
   option that costs nothing if the answer turns out to be "resolution was never the problem".
2. Run the falsification test on that daily history, **with its power analysis**.
3. If the power analysis says the test could have detected an injected signal, resolution was
   not the constraint — the verdict stands on its own merits and no re-backfill is needed.
4. Only if the test is blind to an injected signal is finer resolution worth buying, and then
   **4-hourly first** (~43,000 rows, 14% of quota) — it captures most of the coverage gain at
   a quarter of hourly's storage, and the exclusion-guard objection bites far less at 4h.
5. Whatever is chosen, record the effective sample size after exclusion, not the row count.
   Every argument here turns on that number, and nobody has measured it.

Until step 2 has run, **do not re-backfill at a finer resolution and do not assert that daily
is insufficient.** Both would be re-taking a decision on an unmeasured premise — the mistake
in §2's Supabase reversal, repeated.

---

## 8. Open defects and loose ends

| # | Defect | Where it bites |
|---|---|---|
| 1 | **`etf_streak_days` sign mismatch.** `catoshi-schema.sql` describes it as signed; the collector returns an **unsigned** counter, with direction carried in `etfNetFlowUsd`. The spec-014 rule reads it correctly, but `build_state_vec` computes dimension 16 as `etf_streak_days / 10` mapped into −1..1 — assuming a sign the data does not carry | Spec 012. Must be fixed before any vector is built |
| 2 | **`SIGNALS_REVALIDATE_SECONDS`** remains in `src/consts/signals.ts` after spec 014 removed `revalidate` from the route. Appears dead | Cleanup, spec 016 |
| 3 | **Spec-014 rule thresholds are conventions, not evidence.** Chosen by eye | Becomes measurable after spec 011 |
| 4 | **The analog falsification test has never been run on real data.** `src/scripts/analog-falsification.ts` is written and sitting in the repo | Gate for spec 012 |
| 5 | **`forecasts.cost_usd` may not actually be populated.** `src/consts/forecastPricing.ts` exists; the write path is unverified | Spec 011, Slice 4 |
| 6 | **Forecast-to-snapshot binding has no age limit.** If collection stops for a day, a forecast silently binds to a 24-hour-old snapshot | Spec 011, requirement 2.6 |
| 7 | **Liquidations are not collected.** Correctly deferred — the data is WebSocket-only, not REST, so it needs an always-on process, which Vercel is not. Open by choice | Revisit only if spec 011 shows the measure carries weight |
| 8 | **`catoshi-schema.sql` column set does not match the shipped migrations.** Read it as design intent, not as DDL | Specs 011 and 012 |
| 9 | **`find_analogs` in the reference schema does not implement the guards spec 012 requires.** Its `exclude_days` window is measured from `now()`, not from the query snapshot's `ts`, so neighbours adjacent *to the query* are not excluded at all; there is no causal guard (`s.ts < query.ts`); and the default window is a flat 14 days rather than `30 + horizon`. Copying it as written would produce exactly the self-confirming statistic spec 012 exists to avoid | Spec 012, Slice 2 |
| 10 | **`outcomes.forecast_id` is `UNIQUE` in the reference schema**, but migration `0002_outcomes_multi_horizon` makes outcomes multi-horizon. The uniqueness key must be `(forecast_id, horizon)` | Spec 011 |
| 11 | **The reference `news` table predates spec 015** — it has `class`, `sentiment` and an `assets[]` array, but no scope/direction/magnitude/horizon split, no `prompt_version`, and no cost columns. Do not build spec 015 on it | Spec 015 |
| 12 | **The reference schema seeds `assets` with ETH only**, and creates the partial HNSW index for `asset_id = 1` only. Three assets are tracked; three partial indexes are needed | Spec 012 |
| 13 | **Neon note 2 in the reference schema recommends reading through Vercel KV** to avoid waking the database. Superseded — there is no KV layer, and the health endpoint's cost is measured directly instead (spec 017) | — |

---

## 9. Reference designs that are not implementations

- **`catoshi-schema.sql`** (in the Claude Project, not the repo) holds `state_vec`,
  `find_analogs`, `compute_brier`, `resolve_forecast` and the calibration views. It is the
  **reference design** for specs 011 and 012, written 25.08.2026 before any migration shipped.
  Read it for intent, never as DDL.

  **What is genuinely useful in it:** the `build_state_vec` feature list and normalisers; the
  reasoning for a hand-built vector over a text embedding; L2 rather than cosine (magnitude
  is the signal); the partial-HNSW-per-asset reasoning, verified at ~3.5 ms on 50k rows; the
  probability-sum trigger on `forecasts`; multi-category `compute_brier`; and
  `v_calibration_by_regime`, which is the query that would have caught the founding forecasting
  miss.

  **What is wrong or stale in it** — defects 1 and 9–13 above: the `etf_streak_days` sign, the
  analog guards, `outcomes` uniqueness, the `news` table, single-asset seeding and indexing,
  and the Vercel KV note. Anyone implementing from this file must read those first.
- **The ETH forecast log** (in the Claude Project) is the manual process this pipeline
  automates: a 10-point pre-forecast checklist, and a record of misses with the rule each one
  produced. Two rules from it are load-bearing for the forecast prompt:
  1. Never draw a directional conclusion from technical analysis alone when at least two of
     three hold: volatility compressed, positioning one-sided (>65%), a known macro or
     political trigger inside the forecast horizon. In that configuration the base case is an
     impulse, not a range.
  2. Always give probabilities. Never "it will not". And carry an explicit **exogenous shock**
     probability — ~5% in a normal week, 20–30% during an active conflict — which does not
     spread evenly across scenarios but almost always thickens the bearish side.
