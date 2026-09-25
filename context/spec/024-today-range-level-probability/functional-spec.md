# Functional Specification: Today Range & Level Probability

- **Roadmap Item:** Projections → short-horizon forecast ("for today")
- **Status:** **REJECTED 2026-09-23 — Verdict C.** See §0. Nothing ships. The
  built code (pure model, `/api/today`, `TodayPanel`, daily scoring) stays in
  the repo but is gated off (`TODAY_GATE_VERDICT = 'C'` in `src/consts/today.ts`)
  rather than deleted, in case a future spec proposes a different volatility
  model behind the same UI/API contract (functional §4).
- **Author:** Serhii Kushnir
- **Created:** 2026-09-21

---

## 0. GATE: calibration before UI

Every number on this card is a **model estimate**. `context/README.md` §4 rule 2 allows
that only if the estimate is shown to be calibrated. So the backtest (tasks Slice 1) runs
**first**, on real 1h history. Its verdict decides what ships:

| Verdict | What ships |
|---|---|
| **A**: bands and touch probabilities calibrated (criteria in `technical-considerations.md` §4) | Full card |
| **B**: bands calibrated, touch probabilities not | Range bands only. No level input |
| **C**: bands not calibrated, even after the single-scalar σ correction | **Nothing.** Close the spec, record the numbers |

**Verdict: C.** Run 2026-09-23, GitHub Actions `today-range-backtest.yml`
([run 35833428806](https://github.com/kushnir-serhii/catoshi_dashboard/actions/runs/35833428806)),
730 days of 1h **spot** klines (`data-api.binance.vision` — `fapi.binance.com`
and `api.binance.com` both returned HTTP 451 "restricted location" to the
runner IP on the day of the run; see `today-range-backtest.ts`'s header for
the full explanation and the caveat that spot vs perpetual-futures basis is a
real, if small, source difference from what `/api/today` reads live), 70/30
chronological split with a 24-bar gap, `k` fitted on train to hit 90% coverage.

Both horizons (fixed 24h and rest-of-UTC-day) failed. Per-asset `k` narrowed
the 90% band close to target, but could not simultaneously fix the 50% band or
the touch/close-beyond reliability curve — exactly the shape-mismatch the
single-scalar correction was flagged as unable to fix (`technical-considerations.md`
§4, §2.1) if the return distribution isn't well described by the model shape.

| Asset | Horizon | k | 90% coverage (target 87–93%) | 50% coverage (target 46–54%) | Bands | Touch reliability | Close-beyond reliability |
|---|---|---|---|---|---|---|---|
| BTC | 24h | 1.067 | 89.7% | **58.3%** | FAIL | FAIL (4 of 10 deciles >5pp) | pass |
| ETH | 24h | 1.137 | 91.0% | **62.0%** | FAIL | FAIL (6 of 10 deciles) | FAIL (2 of 5 deciles) |
| SOL | 24h | 1.053 | 90.6% | **53.8%** | pass | FAIL (1 of 10 deciles) | pass |
| BTC | rest-of-day | 1.072 | 90.9% | **63.4%** | FAIL | FAIL (5 of 10) | FAIL (3 of 5) |
| ETH | rest-of-day | 1.145 | 92.1% | **67.7%** | FAIL | FAIL (7 of 10) | FAIL (3 of 5) |
| SOL | rest-of-day | 1.046 | 90.6% | **57.8%** | FAIL | FAIL (2 of 10) | pass |

The dominant, consistent failure: **the 50% band over-covers by 4–14 points on
every asset and both horizons** — realized closes land inside the model's
inner 50% interval far more often than a lognormal, zero-drift model with this
fitted `k` predicts. Touch probability is also consistently **overstated**
(observed < predicted in every failing decile, matching the model's own
documented caveat that continuous-monitoring touch overstates hourly-sampled
touches — worse in practice than the caveat anticipated). Both point at the
same root cause: hourly BTC/ETH/SOL returns have a different central shape
than the fitted lognormal (fatter middle relative to the tails than a normal
distribution scaled by EWMA σ), which one scalar `k` cannot correct — it can
buy back the 90% band or the 50% band, not both at once, exactly the failure
mode the Gate criteria (§4) were designed to catch.

Full per-decile reliability tables and bootstrap CIs: workflow artifact
`today-range-results-35833428806` (`today-range-report.md` / `.json`,
retained 90 days from the run above).

**Per the table below, Verdict C ships nothing.** `TODAY_SIGMA_K` in
`src/consts/today.ts` is intentionally left at its 1.0 default rather than
loaded with these fitted-but-rejected values, so nothing downstream can
mistake them for an adopted correction. `TODAY_GATE_VERDICT` is set to `'C'`,
which keeps `TodayPanel` unrendered in production and stops the daily-scoring
collect stage from issuing new predictions (`runTodayScoring` in
`src/lib/todayScoring.ts`).

---

## 1. Overview and Rationale (The "Why")

The question the user actually asks every day: **"Will ETH reach 2,760 today?"** and
**"What range is realistic before the day ends?"**

The Projections page answers 7–365 day questions. Nothing answers the intraday one. Today
the answer comes from reading 15m charts by eye, with no measured base rate behind it.

This feature is an **honest, measured baseline**: a probability range and a level-touch
probability derived from recent realized volatility, with its hit rate tracked every day.

**It is explicitly not a direction call.** It says how far price can plausibly move, not
which way. The analog Gate (spec 012) and the literature both expect dispersion to be
predictable and direction not. The UI must not imply direction anywhere.

---

## 2. Functional Requirements (The "What")

### 2.1 Scope

- Assets: **BTC, ETH, SOL** (the tracked set, `decisions.md` §1). For any other coin
  selected on Projections, the card shows: "Today range is available for BTC, ETH and SOL."
- Two horizons, switchable with chips:
  - **Rest of day**: until 00:00 in the viewer's local time zone. Label shows the time left,
    e.g. "until midnight · 10h 34m left". If under 1h remains, the chip is disabled and
    **Next 24h** is selected.
  - **Next 24h**: rolling.

### 2.2 The card: "Today"

Placed on the Projections page in the slot the removed Scenario simulator used
(below the chart, beside the AI panel), driven by the selected coin.

1. **Header:** spot price, freshness ("updated 40s ago"), today's high/low so far
   (local day).
2. **Range band:** a horizontal bar with:
   - **90% range:** p5–p95 of the price at horizon end
   - **50% range:** p25–p75
   - a spot marker

   Copy: "90% of the time, price at the end of the period lands in this range."
3. **Level probability:** a price input with quick chips `−2% −1% +1% +2%`
   (relative to spot). For the entered level it shows:
   - **Touches before horizon end:** X%
   - **Closes beyond it at horizon end:** Y%

   "Beyond" means above for a level over spot and below for a level under spot. The
   copy says which.
4. **Track record** (shown only when ≥ 14 resolved days exist):
   "Last 30 days: the 90% range held on 27 of 30 days." This is measured, not modelled
   (§2.4). With fewer days: "Track record builds after 14 days (n so far: 5)."
5. **Footer:** "Model estimate from recent volatility. Not a direction call. Not financial
   advice."

### 2.3 Forbidden on this card

- No "bull / bear / base" wording and no green-for-up, red-for-down colouring on the band.
- No "up X% / down Y%" direction probability.
- No LLM text. This feature makes zero model calls.

### 2.4 Daily scoring

- Once per UTC day, each asset gets a **Next 24h** prediction (p5, p25, p75, p95, σ, model
  version) persisted from 00:00 UTC.
- After it ends, the realized close, high and low are recorded, along with whether the close
  fell inside the 50% and 90% bands.
- This feeds the track-record line and the recalibration decision. Backfilled or backtest
  rows are never mixed in (README §4 rule 4).

### 2.5 Failure states (README §4 rule 1)

| Condition | What the card shows |
|---|---|
| 1h klines fetch failed | "Intraday data unavailable right now." No numbers |
| Newest 1h bar older than 2h | Same message, plus "last data: <time>" |
| Fewer than the minimum bars for σ | "Not enough recent data." |
| Verdict B | Band only. The level input is not rendered at all (not rendered disabled) |

A stale or failed source never renders a number.

---

## 3. Acceptance Criteria

- [ ] §0 verdict recorded with numbers before any UI slice merges.
- [ ] ETH selected, "Rest of day", level 2,760 entered: touch % and close-beyond % appear,
      and both change as the level moves. A level equal to spot shows 100% touch.
- [ ] Moving the level further from spot never increases either probability (monotonic).
- [ ] Touch % ≥ close-beyond % for every level.
- [ ] Killing the klines source (mock 451) renders the unavailable state with no number.
- [ ] SOL/BTC/ETH work. Any other coin shows the availability message.
- [ ] A daily prediction row is written per asset, and it is resolved the day after.
- [ ] The track-record line appears only at n ≥ 14.
- [ ] Mobile 375px: card readable, no horizontal scroll, input usable.

---

## 4. Out of Scope

- Direction probability of any kind.
- Analog-based dispersion (spec 012). A possible v2 **only** if 012 returns Verdict 1, and
  then as a replacement σ source behind the same UI and the same scoring.
- Intraday seasonality (US-open volatility bump), implied volatility (Deribit DVOL), alerts
  and notifications.
- Assets beyond BTC/ETH/SOL.
