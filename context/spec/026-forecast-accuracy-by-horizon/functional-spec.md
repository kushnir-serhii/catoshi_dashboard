# Functional Specification: Forecast Accuracy by Horizon

- **Roadmap Item:** Forecast Scoring & Models Explorer. This follows up "Models Explorer, Rebuilt" (spec 011).
- **Status:** Approved
- **Author:** Serhii Kushnir
- **Created:** 2026-09-23

> Numbering note: `context/README.md` lists spec 025 ("Scenario Simulator Fixes") as in
> progress, but no `025-*` folder exists in this checkout. This spec takes 026 to avoid
> colliding with it. The 025 entry is left untouched.

---

## 1. Overview and Rationale (The "Why")

Every forecast is checked against the real price three times: 1 day, 7 days and 30 days
after it was made. The Models page blends those three checks into one accuracy score per
model.

That hides the question a user actually has: "Can I trust this model for tomorrow, even if
it's weak a month out?" A model that is sharp over one day and poor over thirty gets a
middling blended score that describes neither.

This change keeps the blended score and adds a per-horizon breakdown on each model's card.
The user can then see where a model beats the no-skill baseline and where it doesn't.

**Success:** from the Models page alone, a user can say which horizons a given model is
currently beating the baseline at, which it isn't, and which don't have enough data yet.

---

## 2. Functional Requirements (The "What")

### 2.1 Breakdown row on each model card

Under the existing overall score, each model + prompt version card shows a "By horizon"
row with three entries, always in this order: **1 day · 7 days · 30 days**.

- **Acceptance Criteria:**
  - [ ] The overall mean Brier score, the baseline comparison, the outcome count and the
        monthly trend all look and behave exactly as before.
  - [ ] The "By horizon" row sits below the overall score and above the monthly trend.
  - [ ] The three entries always appear in the order 1 day, 7 days, 30 days.

### 2.2 A horizon with enough data (30 or more scored outcomes)

It shows:

- its mean Brier score, to 3 decimals;
- whether it is beating or below the same no-skill baseline (0.667), and by how much;
- how many scored outcomes it is based on.

It uses the same green (beating) / red (below) colouring as the overall score.

- **Acceptance Criteria:**
  - [ ] Given a model whose 1-day outcomes number 30 or more, the 1-day entry shows a
        score, "Beating"/"Below" with the gap, and its own outcome count.
  - [ ] A score lower than 0.667 is shown in green as beating; a higher one is red and
        below.

### 2.3 A horizon without enough data (fewer than 30 scored outcomes)

It shows its count and "not enough yet" instead of a score, even when other horizons on
the same card have scores. It never shows a score below 30 outcomes.

- **Acceptance Criteria:**
  - [ ] Given 94 one-day outcomes and 12 thirty-day outcomes, the 1-day entry shows a
        score and the 30-day entry shows "12 scored · not enough yet" with no number.
  - [ ] A horizon with zero outcomes shows "0 scored · not enough yet".

### 2.4 The early card state

When the card as a whole has fewer than 30 scored outcomes, the existing "too few to
report accuracy" message stays unchanged. A single line under it shows how many outcomes
each horizon has, e.g. "1 day: 14 · 7 days: 9 · 30 days: 0". No scores appear anywhere on
the card in this state.

- **Acceptance Criteria:**
  - [ ] Given a card with 23 outcomes in total, the "too few" message and the per-horizon
        count line both appear, and no Brier score is shown.

### 2.5 The counts add up

The three per-horizon counts on a card add up to that card's overall outcome count.
Outcomes excluded from scoring stay excluded everywhere, as today.

- **Acceptance Criteria:**
  - [ ] For any card, 1-day + 7-day + 30-day counts equal the "Based on N scored outcomes"
        number.

### 2.6 Mobile

At 375px width the breakdown stays readable with no horizontal scrolling. The three
entries may stack vertically.

- **Acceptance Criteria:**
  - [ ] At 375px, all three entries are fully visible and the page does not scroll
        sideways.

---

## 3. Scope and Boundaries

### In-Scope

- The per-horizon breakdown row on each model card, with its low-data and early states.
- The per-horizon count line in the early "too few" state.

### Out-of-Scope

- Splitting the monthly trend line by horizon. It stays blended; this could be a later
  follow-up.
- Adding, removing or changing the scored horizons (1, 7, 30 days) or the 30-outcome
  minimum.
- Changing the no-skill baseline or how a single forecast is scored.
- Scoring the news classifier. That's a separate roadmap item.
- Today Range (spec 024), which was rejected.
- Other roadmap items, including news impact signals, market history backfill and
  historical analogs.
