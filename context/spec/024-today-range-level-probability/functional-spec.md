# Functional Specification: Today Range & Level Probability

- **Roadmap Item:** Projections → short-horizon forecast ("for today")
- **Status:** Draft, **GATED**: the UI does not ship until the §0 calibration verdict is recorded
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

**Verdict:** _not yet run._

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
