# Functional Specification: Forecast Scoring and the Models Explorer

- **Roadmap Item:** Projections & Models → **Models Explorer**, on real accuracy
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Catoshi generates forecasts and has never once checked whether any of them were right.
`public.forecasts` fills up. `public.outcomes` is empty — migration 0002 says so in a
comment: *"Safe on a populated table only while outcomes is empty, which it is until spec
011 ships."* Nothing resolves a forecast, nothing scores one, and no number anywhere in
the product is derived from a forecast that came true.

Meanwhile the Models page shows an ensemble accuracy of **74.0%**, six named models
including *Tabnet-Pro*, *OnChain-LSTM* and *Whale-Graph*, hit rates like *184/258*,
*1,248 predictions per day*, and *training cycle 412*. **None of it exists.** It is a
hardcoded array in `src/data/models.ts`, rendered by `ModelsPage.tsx` as though measured.
There is no ensemble, there are no six models, nothing trains, and no hit rate has ever
been computed.

This is the third time the same failure appears in this codebase, each time louder:

1. `/api/signals` silently returned mock data on any error, so a database that never
   existed looked like a working feed (spec 010 found it).
2. `lastUpdated` reported the moment of the request, so a feed dead for three days looked
   fresh (spec 014 found it).
3. The Models page reports invented accuracy for models that do not exist.

The first two were accidents of error handling. This one is a page of fabricated
statistics about the product's own predictive skill — the single number a user would most
reasonably act on. It must go, and what replaces it must be computed or absent.

**This spec builds the measuring instrument.** Every forecast gets resolved against what
actually happened, scored, and the score is what the Models page shows. Without it,
nothing in Catoshi can improve, because nothing knows whether it is working: the analog
search of spec 012 is unfalsifiable, and the rule thresholds of spec 014 stay guesses.

**Success looks like:** a user opens Models and sees how well the system's forecasts have
actually done, with every number traceable to a resolved forecast — and sees an honest
"not enough data yet" while that is the truth.

---

## 2. Functional Requirements (The "What")

### 2.1 — Every Forecast Is Resolved Against What Happened

When a forecast's horizon has elapsed, the system records what the price actually did:
the price at the time of the forecast, the price at the horizon, and which of the three
scenarios the outcome fell into. A forecast is resolved at each of its horizons
independently — a forecast is a curve, not a single call, so day 1, day 7 and day 30 are
three separate results about the same forecast.

**Acceptance Criteria:**
- [x] Every forecast whose horizon has elapsed acquires an outcome for that horizon.
- [x] One forecast can hold several outcomes, one per horizon, without conflict.
- [x] Resolving the same forecast and horizon twice does not create a second record or change the first.
- [x] A forecast whose horizon has not yet elapsed is never resolved early.
- [x] The recorded entry price is the market price at the time the forecast was made, not the model's own stated anchor.

---

### 2.2 — Which Scenario Happened Is Decided by a Stated Rule, Not by Eye

Each forecast offers three scenarios. Deciding which one "happened" needs a rule fixed in
advance and applied identically every time, otherwise the score measures the scorer.

The rule divides the price axis at the midpoints between neighbouring scenarios: an
outcome nearer the bull curve than the base curve counts as bull, nearer bear than base
counts as bear, everything between counts as base. A price landing exactly on a boundary
counts as base — the middle scenario, so a tie never inflates a directional call.

**Acceptance Criteria:**
- [x] The realized scenario is derived by a single documented rule, applied to every forecast identically.
- [x] A boundary-exact outcome resolves to the middle scenario.
- [x] When the three scenario prices are not distinct enough to partition the axis, the outcome is recorded as unscoreable rather than assigned a scenario by guess.
- [x] The rule is stated in the spec and reproducible by hand from stored data.

---

### 2.3 — Forecasts Are Scored on Their Probabilities, Not on Being "Right"

The system's forecasts assign a likelihood to each scenario. Judging them by whether the
top-probability scenario occurred throws away most of what was said: a forecast of
50/30/20 and one of 90/5/5 are not equally good when the first scenario happens.

Every resolved forecast therefore receives a score measuring how close its stated
probabilities were to what happened, where a confident correct forecast beats a hesitant
one and a confident wrong forecast is punished hardest.

**Acceptance Criteria:**
- [x] Every scoreable outcome carries a numeric score derived from the forecast's stated probabilities and the realized scenario.
- [x] A forecast that put more probability on the scenario that happened scores better than one that put less.
- [x] The score is stored, not recomputed differently in different places.
- [x] Outcomes that are unscoreable (2.2) carry no score rather than a zero.

---

### 2.4 — Scores Are Comparable Only Within the Same System

A forecast made by a different model, or under a different prompt, is a different system.
Averaging their scores together produces a number about nothing. Every reported figure is
therefore grouped by model and prompt version, and the grouping is visible to the reader.

**Acceptance Criteria:**
- [x] Every aggregate score states which model and prompt version it covers.
- [x] Scores from different models or prompt versions are never averaged into one figure presented as a single system's skill.
- [x] Changing the prompt starts a new series rather than continuing the old one.

---

### 2.5 — Back-Filled History Never Enters a Score

Back-filled snapshots (spec 013) carry only price-derived fields; their positioning and
flow fields are absent, not neutral. A forecast scored against a back-filled snapshot
would be judged under conditions that were never observed, and the system would learn
from its own invention.

**Acceptance Criteria:**
- [x] Forecasts linked to a back-filled snapshot are excluded from every calibration figure.
- [x] The exclusion is visible: a reader can tell how many forecasts were set aside and why.

---

### 2.6 — A Forecast Is Tied to Conditions That Were Actually Current

A forecast links to the most recent snapshot for its asset. If collection stalled, that
snapshot may be a day old, and the forecast would be scored against market conditions
that had already passed. Beyond a stated age limit, the forecast records no snapshot link
at all rather than a misleading one.

**Acceptance Criteria:**
- [x] A forecast links to a snapshot only when that snapshot is within the stated age limit.
- [x] Beyond the limit the forecast is still recorded, with no snapshot linked.
- [x] Forecasts with no linked snapshot are excluded from any figure that claims to describe performance under given market conditions.

---

### 2.7 — The Models Page Shows Measured Numbers or Says It Has None

`src/data/models.ts` is deleted. Every figure on the Models page comes from resolved
outcomes. Where there is not yet enough resolved history to say anything, the page says
so plainly — an honest "12 forecasts resolved, too few to report accuracy" is worth more
than a fabricated 74%.

**Acceptance Criteria:**
- [x] `src/data/models.ts` no longer exists and nothing imports it.
- [x] Every number on the Models page traces to resolved outcomes in the database.
- [x] With too little resolved history, the page shows an explicit insufficient-data state rather than a placeholder number, a zero, or an empty chart.
- [x] The page states how many forecasts each figure is based on.
- [x] No model, metric or entity is displayed that does not exist in the system.

---

### 2.8 — The Score Is Readable Against a Baseline

A score in isolation means nothing to a reader: they cannot tell whether it is good. Every
reported score is shown next to the score a system that knows nothing would achieve, so
"better than guessing" is visible rather than inferred.

**Acceptance Criteria:**
- [x] Every reported score is displayed alongside the no-skill baseline for the same scoring method.
- [x] The comparison makes clear whether the system is beating the baseline.
- [x] The trend over time is visible, since the goal is a score that falls month over month.

---

### 2.9 — Resolution Never Breaks Collection or the Dashboard

Scoring runs on a schedule alongside collection. Snapshot data is unrecoverable if a run
is lost (spec 010 §1); scores are always recomputable from stored forecasts and prices. A
failure in scoring must therefore never cost a snapshot, and never take down a page.

**Acceptance Criteria:**
- [x] A failure while resolving or scoring leaves snapshot collection unaffected.
- [x] A failure is logged and surfaced, not swallowed.
- [x] The Models page degrades to its insufficient-data or error state rather than showing stale or invented numbers.

---

## 3. Scope and Boundaries

### In-Scope

- Resolving elapsed forecasts into outcomes, at each horizon.
- A stated, reproducible rule for which scenario occurred.
- A probability-based score per resolved forecast, stored.
- Aggregates grouped by model and prompt version, with counts.
- Excluding back-filled and unlinked forecasts from calibration.
- The snapshot age limit for forecast linkage.
- Rebuilding the Models page on measured data, with an insufficient-data state.
- Deleting `src/data/models.ts`.

### Out-of-Scope

- **Automatically rewriting the system prompt from the scores.** The weekly review reads
  the numbers; changing the prompt stays a human decision, and each change starts a new
  prompt version under 2.4.
- **Re-calibrating spec 014's rule thresholds.** This spec makes them measurable; moving
  them is separate work with its own evidence.
- **Historical analog search (`pgvector`)** — spec 012, which this spec makes falsifiable.
- **Back-filling outcomes for forecasts made before this ships**, where no entry price was
  recorded at the time.
- **Scoring the signal rules of spec 014.** Signals state present facts, not predictions;
  scoring applies to forecasts.
- **Model comparison as a leaderboard or automatic model selection.**
