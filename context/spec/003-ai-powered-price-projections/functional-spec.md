# Functional Specification: AI-Powered Price Projections

- **Roadmap Item:** Forecasting with Real Data — Power the projections page with live data and model-driven forecasts
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The projections page currently shows a price forecast chart for Bitcoin, but the forecast is not real — it is generated from a fixed pattern that never changes. A user visiting the dashboard today sees exactly the same chart as a user visiting last week, making the forecast meaningless as a decision-making tool.

This feature replaces that static chart with a genuinely fresh AI-generated forecast. Every six hours, the app gathers live global market data — including recent crypto news headlines, whale wallet movements, fear & greed sentiment, and current prices — and sends it all to an AI service chosen by the user. The AI analyzes this data and produces realistic, reasoned 60-day price forecasts for Bitcoin, Ethereum, and Solana, each with three scenarios: bullish, base case, and bearish.

The user can also choose which AI service (Claude or OpenAI) and which specific model powers their forecasts, and save up to five forecast snapshots by name for future comparison.

**Success looks like:** A user opens the dashboard, sees that the BTC forecast was generated 2 hours ago using Claude Sonnet, reads the reasoning ("ETF inflows surged this week; Fear & Greed neutral at 54"), and glances at the confidence score of 71%. They switch to ETH, compare the outlook, then save the snapshot as "May bull run — pre-halving" for later reference.

---

## 2. Functional Requirements (The "What")

### 2.1 — Coin Tabs on the Projections Chart

**As a** user, **I want to** switch between Bitcoin, Ethereum, and Solana forecasts on the projections page, **so that** I can compare AI outlooks across the assets I care about most.

**Acceptance Criteria:**
- [x] The projections chart area displays three tabs: **BTC**, **ETH**, **SOL**
- [x] BTC is selected by default when the page loads
- [x] Clicking a tab immediately updates the chart, confidence score, reasoning, and timestamp to show that coin's forecast
- [x] Only one tab can be active at a time

---

### 2.2 — AI-Generated Bull / Base / Bear Chart

**As a** user, **I want to** see three forecast scenarios on the chart — optimistic, likely, and pessimistic — **so that** I can understand the range of possible outcomes, not just a single prediction.

**Acceptance Criteria:**
- [x] The chart shows 90 days of recent historical price data followed by a 60-day forecast
- [x] The forecast displays three clearly differentiated lines: Bull (green, dashed), Base (violet, solid), Bear (red, dashed)
- [x] A semi-transparent band fills the space between the bull and bear lines in the forecast zone
- [x] A vertical "Today" marker separates historical data from forecast data
- [x] When the user hovers over the forecast zone, a tooltip appears showing the bull, base, and bear prices for that specific date
- [x] The forecast data is AI-generated based on real-world market conditions, not a fixed pattern

---

### 2.3 — Always-Visible Forecast Context Panel

**As a** user, **I want to** see the confidence level, freshness, and reasoning for the current forecast at all times, **so that** I can immediately judge how much weight to put on it.

**Acceptance Criteria:**
- [x] The following are always visible on the page (not hidden inside a tooltip):
  - **Confidence score** — displayed as a percentage (e.g. "73% confidence")
  - **Last updated** — human-readable timestamp (e.g. "Updated 2 hours ago")
  - **Key reasons** — 2 to 3 short lines explaining why the AI made this forecast (e.g. "ETF inflows at 3-week high · Fear & Greed neutral at 54 · Whale accumulation rising")
  - **Service & model used** — small label showing which AI generated this forecast (e.g. "Claude Sonnet")
- [x] This context panel updates when the user switches coin tabs
- [x] This context panel updates when a saved snapshot is loaded onto the chart

---

### 2.4 — Automatic 6-Hour Forecast Refresh

**As a** user, **I want to** always see a reasonably fresh forecast without having to do anything, **so that** the data reflects today's market conditions.

**Acceptance Criteria:**
- [x] The forecast for each coin is automatically regenerated approximately every 6 hours
- [x] The "Last updated" timestamp reflects the actual time the most recent forecast was generated
- [x] No manual reload, re-deploy, or user action is required for the new forecast to appear
- [x] While the page is loading a fresh forecast for the first time (no data yet), the chart area shows a pulsing skeleton animation as a placeholder

---

### 2.5 — Manual "Refresh Forecast" Button

**As a** user, **I want to** be able to request a fresh forecast at any time, **so that** I can get an up-to-date read when a major market event just happened.

**Acceptance Criteria:**
- [x] A "Refresh forecast" button is visible on the projections page
- [x] Clicking it triggers a new AI forecast for all three coins using the currently selected service and model
- [x] While refreshing, the button is disabled and shows a loading indicator
- [x] Once complete, the chart, confidence score, reasoning, and timestamp all update
- [x] If the refresh fails, the button returns to its normal state and the existing forecast remains visible

---

### 2.6 — Stale Forecast Warning

**As a** user, **I want to** be clearly told when the forecast I'm looking at may be out of date, **so that** I don't make decisions based on stale information without knowing it.

**Acceptance Criteria:**
- [x] If the AI service is temporarily unavailable and the last known forecast is shown as a fallback, a visible warning banner appears (e.g. "Forecast may be outdated — last generated 14 hours ago")
- [x] The forecast chart and all three scenarios remain visible behind the warning
- [x] The warning disappears automatically once a fresh forecast is successfully generated

---

### 2.7 — AI Service & Model Settings Modal

**As a** user, **I want to** choose which AI service and model generates my forecasts, **so that** I can control the quality, cost, and style of predictions I receive.

**Acceptance Criteria:**
- [x] A settings button (e.g. gear icon) on the projections page opens a settings modal
- [x] Inside the modal, the user can select an **AI service**: Claude or OpenAI
- [x] After selecting a service, the user can select a **model** from a fixed list:
  - Claude: Haiku, Sonnet, Opus
  - OpenAI: GPT-4o mini, GPT-4o
- [x] Only one service and one model can be active at a time
- [x] The current selection is highlighted so the user always knows what is active
- [x] An "Apply & Refresh" button in the modal saves the selection and immediately generates a new forecast using the chosen service and model
- [x] The selected service and model are remembered between browser sessions — if the user closes and reopens the dashboard, their last choice is pre-selected
- [x] The context panel on the chart (section 2.3) reflects which service and model generated the currently displayed forecast

---

### 2.8 — Saved Forecast Snapshots

**As a** user, **I want to** save named snapshots of forecasts I find interesting, **so that** I can come back later and compare how AI predictions have changed over time.

**Acceptance Criteria:**
- [x] A "Save snapshot" button is visible on the projections page
- [x] Clicking it opens a small prompt asking the user to enter a name for the snapshot (e.g. "May bull run — pre-halving")
- [x] After confirming, the snapshot is saved and appears in the **"Saved Forecasts"** section of the settings modal
- [x] A maximum of **5 snapshots** can be saved at any time; if the user already has 5, the save button is disabled and a message appears: "Delete a saved forecast to save a new one"
- [x] Each saved snapshot entry shows:
  - The user-defined name (editable by clicking it)
  - The date and time it was saved
  - Which coin it was for (BTC / ETH / SOL)
  - Which service and model generated it
- [x] Clicking a snapshot entry loads that forecast onto the chart — the chart, confidence score, reasoning, and context panel all update to reflect the saved data
- [x] A delete icon on each entry allows the user to permanently remove that snapshot
- [x] Snapshots are stored in the user's browser and persist between sessions; they are not synced to any server

---

## 3. Scope and Boundaries

### In-Scope

- AI-generated 60-day bull/base/bear forecasts for BTC, ETH, and SOL
- Switchable coin tabs on the projections chart
- Always-visible confidence score, timestamp, reasoning, and service/model label
- Hover tooltip on forecast zone showing scenario prices
- Automatic 6-hour forecast refresh (no rebuild or re-deploy required)
- Manual "Refresh forecast" button
- Settings modal with AI service selector (Claude / OpenAI) and model selector
- Service and model preference persisted in browser between sessions
- Save up to 5 named forecast snapshots in browser storage
- Ability to rename, load, and delete saved snapshots from the settings modal
- Skeleton loading state on first load
- Stale forecast warning banner

### Out-of-Scope

The following are separate roadmap items and will be addressed in their own specifications:

- **Historical Price Chart** (Phase 1) — replacing historical data with live exchange prices
- **Asset List with Live Sparklines** (Phase 1) — live prices in the watchlist/asset table
- **Live Price Ticker** (Phase 2) — real-time streaming price updates on the chart
- **Real Holdings & P&L** (Phase 3) — portfolio value, cost basis, and unrealized gains
- **Models Explorer** (Phase 3) — surfacing AI model metadata, accuracy scores, and hit rates
- Syncing saved snapshots across devices or to a server account
