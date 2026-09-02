# Functional Specification: Signals From Market State

- **Roadmap Item:** Phase 2 — AI / Market Signals Feed → **make it actually work**
- **Status:** Completed
- **Author:** Serhii Kushnir
- **Supersedes:** the delivery half of spec 002 (the UI it specified stands; the data behind it never existed)

---

## 1. Overview and Rationale (The "Why")

The Signals page is finished on the outside and empty on the inside. `SignalsPage.tsx`
renders cards, skeletons and timestamps exactly as spec 002 described. `/api/signals`
queries `select * from signals`. **That table does not exist in any migration, and no
code anywhere writes a signal.** The page has never shown a real signal and cannot.

Spec 002 is marked **Completed**. It is not. The only reason this went unnoticed for so
long is the mock fallback that used to sit in the route handler: any error returned
`mockSignalsResponse`, so an absent database looked like a working feed. That fallback
has since been replaced with an honest `fetchError: true`, which is why the page is now
visibly empty rather than invisibly fake. This spec finishes the job.

**The decision this spec makes.** Spec 002 assumed signals come from news headlines
classified by a language model. Since then, spec 010 built something spec 002 did not
have: an hourly snapshot store with RSI across four timeframes, moving averages, ATR,
volume z-scores, funding, open interest, long/short ratio, ETF flows and Fear & Greed —
for BTC, ETH and SOL. Signals derived from that store are free, deterministic,
reproducible, unit-testable, and impossible to hallucinate. Signals derived from news
cost tokens on every refresh, cannot be reproduced, and can invent a headline that was
never published.

So this spec builds signals from market state. News-based signals are not abandoned —
they answer a different question ("*why* did it move") that market state genuinely
cannot, and they are scoped to a later spec once this one proves the pipeline end to end.

**Success looks like:** a user opens Signals and sees six statements about the current
market that are true, timestamped, traceable to a snapshot row, and generated without a
single model call.

---

## 2. Functional Requirements (The "What")

### 2.1 — The Feed Shows Real, Current Market Conditions

The Signals page shows up to six signal cards derived from the most recent snapshot of
each tracked asset. Each signal states one specific, checkable condition — for example
that ETH's daily RSI has crossed into overbought territory, that funding has flipped
negative, that ETF flows have run positive for five consecutive days.

Each card keeps the shape spec 002 defined, with the fields now meaning:

| Field | Meaning here |
|---|---|
| Sentiment label | Bullish / Bearish / Neutral, decided by the rule that fired |
| Headline | The condition, in plain language, up to 8 words |
| Body | Why it matters, up to 20 words, with the actual number in it |
| Source | The rule's origin, e.g. `RSI 1d` or `Funding` — not a news domain |
| Publication time | The `ts` of the snapshot the signal was derived from |
| Coin chips | The asset the signal is about |

**Acceptance Criteria:**
- [x] Every signal shown corresponds to a condition that is true in the snapshot it cites.
- [x] Every signal card displays sentiment, headline, body, source, timestamp and coin chip.
- [x] The body contains the actual measured value, not a vague description.
- [x] Sentiment labels remain visually distinct for Bullish, Bearish and Neutral.
- [x] Signals are ordered by importance, not by asset or alphabetically.

---

### 2.2 — Signals Are Written, Not Invented at Read Time

Signals are produced by the same scheduled run that collects snapshots, and persisted.
The API reads stored rows; it never computes signals on request. Two users loading the
page a second apart see the same feed, and a signal that appeared an hour ago can still
be found in the database afterwards.

**Acceptance Criteria:**
- [x] A `signals` table exists in a migration and is created by running migrations.
- [x] Each signal row records which snapshot it came from and which rule produced it.
- [x] `/api/signals` performs no indicator computation and calls no external API.
- [x] Reloading the page without a new collection run returns an identical feed.
- [x] Re-running collection for an hour already processed does not duplicate signals.

---

### 2.3 — The Feed Reflects Now, Not the Whole History

Only signals derived from recent snapshots are shown. A signal older than a defined
freshness window never appears, even if that leaves fewer than six cards — an empty slot
is honest, a stale signal presented as current is not.

**Acceptance Criteria:**
- [x] Signals derived from snapshots older than the freshness window are excluded.
- [x] Fewer than six qualifying signals renders fewer than six cards, with no padding.
- [x] The same condition persisting across consecutive runs does not produce a new card each hour.

---

### 2.4 — Empty and Broken Are Told Apart, and Both Are Visible

The page currently has one failure mode and shows none of them. Three states must be
distinguishable to the user:

1. **Loading** — skeleton cards, as today.
2. **Nothing to report** — collection is healthy, no rule fired. The page says so plainly.
3. **Broken** — the query failed, or collection has not run recently. The page says the
   feed is not updating, and does not pretend that silence means calm markets.

The existing "data may be outdated" banner covers a fourth case (a stale-but-readable
feed) and stays.

**Acceptance Criteria:**
- [x] With zero qualifying signals and healthy collection, the page shows an explicit "no signals" state, not blank space.
- [x] When `fetchError` is true, the page shows an error state — it is currently returned by the API and ignored by the UI.
- [x] The "no signals" and "feed is broken" states are visually and textually different.
- [x] A stale feed still shows its signals, with the existing warning banner above them.

---

### 2.5 — Coin Chips Only Claim Assets That Are Actually Tracked

`TRACKED_COINS` lists BTC, ETH, SOL, LINK, ARB and TAO. Collection covers only BTC, ETH
and SOL. A signal can only ever be about an asset that has snapshots, so the constant
must stop advertising three assets the system knows nothing about.

**Acceptance Criteria:**
- [x] The tracked-coin list used by the Signals feature matches the assets actually collected.
- [x] No signal references an asset with no snapshot rows.

---

### 2.6 — A Signal Is Never Built From Missing Data

Every numeric field on a snapshot is nullable by design: spec 010 made a failed source
null rather than failing the whole snapshot. A signal must never be produced from a
reading the system does not have. If funding is unknown, the feed says nothing about
funding — it does not report a flip to zero.

**Acceptance Criteria:**
- [x] No signal is shown whose condition depends on a value that was null in the snapshot it cites.
- [x] A source outage removes only the signals that depend on it; the rest of the feed stays intact.
- [x] A missing value is never substituted with 0, 50, or any other default.

---

### 2.7 — Spec 002 Stops Claiming to Be Done

`context/spec/002-ai-market-signals-feed/functional-spec.md` is marked **Completed** with
every acceptance criterion ticked, while the feature has never worked. A spec that lies
about its own status is worse than no spec: it is why this gap survived three subsequent
specs.

**Acceptance Criteria:**
- [x] Spec 002's status reflects reality and points to this spec.
- [x] Criteria in 002 that were never satisfied are un-ticked or annotated.

---

## 3. Scope and Boundaries

### In-Scope

- A `signals` table, in a migration, with provenance back to a snapshot and a rule.
- A deterministic rule layer over the existing snapshot fields.
- Signal generation inside the existing scheduled collection run.
- `/api/signals` reading stored rows only.
- Empty, error and stale states on the Signals page.
- Aligning the tracked-coin list with the assets actually collected.
- Correcting spec 002's status.

### Out-of-Scope

- **News-sourced signals and LLM classification** — a later spec. They answer "why it
  moved", which this spec cannot, and they carry token cost, non-reproducibility and
  hallucination risk that deserve their own acceptance criteria.
- **Redesigning the Signals page.** The card layout, skeletons and timestamps from spec
  002 stay as they are; only the missing states are added.
- **User-configurable rules, thresholds, assets or card count.**
- **Alerts, notifications, or click-through to a source.**
- **Filtering or sorting by coin, sentiment or date** — still out, as in 002.
- **Backfilling signals over historical snapshots.** Signals describe the present; the
  historical record already lives in `snapshots` (spec 013).
- **Scoring whether signals were right.** That is the Brier machinery of spec 011, and it
  applies to forecasts, not to statements of current fact.
