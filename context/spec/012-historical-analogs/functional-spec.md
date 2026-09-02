# Functional Specification: Historical Analogs

- **Roadmap Item:** Phase 6 → Conditional & Optional → **Historical Analogs**
- **Status:** Approved, **GATED** — do not implement past the Gate without a verdict
- **Author:** Serhii Kushnir

---

## 0. GATE — read this before anything else

**This feature may not be built until the falsification test has been run on real data and
its verdict recorded.** The test is already written and sitting in the repository:

```
src/scripts/analog-falsification.ts   (with analog-core.ts, analog-core.test.ts)
```

Spec 012 rests on one assumption: **that similar market states are followed by similar
forward returns.** That assumption has never been checked. If it is false, spec 012 is an
HNSW index that returns beautiful neighbours which mean nothing — and, worse, a product
surface stating measured base rates that measure noise. That is the failure mode this
project has already shipped three times (`decisions.md` §3), and here it would be dressed in
statistics.

The test is cheaper than specs 011 and 012 combined, and its result decides whether this one
exists.

### Gate entry criteria

- [ ] Spec 013 has run and the backfill is in place at daily resolution, **with the effective
      sample size after neighbour exclusion measured** — not merely the row count. Whether
      finer resolution is needed is decided by this test's power analysis, not before it
      (`decisions.md` §7.1).
- [ ] Defect 1 in `decisions.md` §8 is fixed: `etf_streak_days` is unsigned in the collector
      but `build_state_vec` maps it into −1..1 as if signed. **Building any vector before
      this is fixed bakes a sign that does not exist into every stored row.**

### Gate exit — one of three verdicts, recorded in this file

1. **Signal in dispersion, none in direction.** The expected result per the literature.
   → **Build**, but only as a source of expected range and base rates. **Never as a
   direction predictor**, and the UI must not imply one.
2. **Nothing found, and the power analysis shows the test could have found it.**
   → **Do not build.** Close this spec as rejected and put the effort into spec 011.
3. **Nothing found, and the test was blind even to an injected signal of known strength.**
   → This is not evidence that analogs do not exist; it is evidence that this many dimensions
   over this much history has no resolving power. `find_analogs` would fail for the same
   reason. → **Do not build as specified.** The exits are: fewer dimensions, more history, or
   both — and each is a new gate, not a licence to proceed.

The script computes a **power analysis on the real state geometry**, injecting a signal of
known strength and finding where it starts detecting it. Without that, "we found nothing" is
indistinguishable from "we could not have found anything". Do not accept a verdict from a run
that skipped it.

**Verdict:** _not yet run._

---

## 1. Overview and Rationale (The "Why")

The question a market watcher actually asks is not "what does the model think" but **"has
this happened before, and what followed?"** Today the only thing that can answer it is the
model's recollection, which is unmeasured and unfalsifiable.

This spec answers it from stored data: represent each hourly snapshot as a normalised
market-state vector, find the historically nearest ones, and report what actually happened
after them as measured base rates.

**Success looks like:** the forecast context panel says *"Of 18 comparable setups since 2017,
price rose in 7 (39%); median 7-day move −2.1%; interquartile range −8.4% to +4.6%"* — and
every one of those numbers is derived from rows in the database, computed under guards that
make self-confirmation impossible.

**Failure looks like** the same sentence with the same confident formatting, computed over
neighbours that are merely temporally adjacent to the query. That failure is invisible
without the guards in §2.3, which is why they are requirements and not implementation notes.

---

## 2. Functional Requirements (The "What")

### 2.1 Every snapshot has a comparable state vector

- **Acceptance Criteria:**
  - [ ] Each snapshot carries a fixed-length normalised numeric vector derived from its
        indicator, derivative and flow columns.
  - [ ] Vector construction is deterministic: the same snapshot always yields the same vector.
  - [ ] The **normalisation divisors are feature weights** under L2 distance and are treated
        as a documented decision, not an implementation detail. The current spec divisors
        (`/20.0`, `/50.0`, `/0.001`) were chosen by eye and implicitly assert that funding
        matters as much as RSI (`decisions.md` §7.5).
  - [ ] Both the spec normalisers and plain per-column z-scores are evaluated, and the choice
        made is recorded with its evidence.
  - [ ] A dimension whose source column is null does not silently become zero. Either the
        snapshot is excluded from the searchable set, or the dimension is explicitly marked
        absent — never defaulted into a value that reads as a measurement.
  - [ ] **Backfilled snapshots are labelled and their derivative dimensions are known to be
        constant.** Six derivative dimensions do not backfill; over history this is
        effectively a search over ten price dimensions, and that must be stated wherever the
        result is displayed.

### 2.2 Analog search returns measured outcomes

- **Acceptance Criteria:**
  - [ ] Given a query snapshot, the system returns the k nearest historical snapshots for the
        same asset, with their distances.
  - [ ] For each requested horizon (1 / 7 / 30 days), it reports: neighbour count, share that
        rose, median forward return, and an interquartile range.
  - [ ] Cross-asset analogs are not returned — ETH is matched against ETH history only.
  - [ ] Search latency stays inside the collection run's budget on the full history.

### 2.3 Two guards, both mandatory

These are the difference between a statistic and a self-fulfilling one.

- **Acceptance Criteria:**
  - [ ] **Neighbour exclusion.** Snapshots within `30 + horizon` days of the query are
        excluded. Plain 30 is not enough: at a 30-day horizon the query's and the neighbour's
        forward windows overlap, and the "analog" is partly the query itself.
  - [ ] **Look-ahead guard.** Only snapshots whose forward horizon has fully elapsed are
        eligible. A neighbour whose outcome is not yet known contributes nothing, and must not
        be counted as if it did.
  - [ ] **Causal mode.** Neighbours are drawn only from the query's past.
  - [ ] Each guard has a test that fails if the guard is removed.

### 2.4 The result is presented as what it is

- **Acceptance Criteria:**
  - [ ] Below a minimum neighbour count the section is **hidden entirely** — not shown with a
        small-sample caveat. A base rate over four neighbours is not a base rate.
  - [ ] The displayed text states the sample size and the period the history covers.
  - [ ] It states that over backfilled history the match is on price dimensions only.
  - [ ] It never phrases the result as a prediction. "Of N comparable setups, price rose in M"
        — not "price is likely to rise".
  - [ ] If Verdict 1 applies, no directional claim is presented at all: range and base rates
        only.

### 2.5 The forecast prompt receives base rates, not vibes

- **Acceptance Criteria:**
  - [ ] Analog statistics are injected into the forecast prompt as explicit measured base
        rates with their sample size.
  - [ ] The injection **bumps `prompt_version`**. It changes the forecaster, so scores before
        and after are different systems and must not be pooled (`decisions.md` §6).
  - [ ] Below the minimum sample size, nothing is injected — the prompt must not receive a
        weak base rate framed as a strong one.

---

## 3. Scope and Boundaries

### In-Scope

- `pgvector` on Neon; a normalised state vector per snapshot with a per-asset partial HNSW index.
- Search and summary functions with the guards in §2.3.
- Analog base rates in the forecast context panel.
- Analog base rates injected into the forecast prompt, behind a `prompt_version` bump.
- Fixing `decisions.md` §8 defect 1 (`etf_streak_days` sign) before any vector is built.

### Out-of-Scope

- Any trading signal or recommendation derived from analogs.
- Cross-asset analogs.
- Learned embeddings or a text embedding of market state — market state is numeric, and
  embedding a description of it discards magnitude, which is the entire signal.
- Automatic feature-weight learning. Leave-one-out dimension analysis informs a human choice.
- Scoring analog-informed forecasts separately. Spec 011 already separates by `prompt_version`,
  which is sufficient.
- **Building anything at all before the Gate in §0 returns Verdict 1.**
