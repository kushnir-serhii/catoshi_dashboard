# Functional Specification: Real-Data Coin Price Projection Chart

- **Roadmap Item:** Projections & Models → Forecasting with Real Data
- **Status:** Draft
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The projections page is meant to be the place a user goes to answer one question: _"where is this coin's price likely to go, and how wrong could that guess be?"_ Today it does not answer that question honestly.

The chart is labelled "Portfolio Projection", yet it has BTC / ETH / SOL tabs — so the user cannot tell whether they are looking at a coin price or the value of their holdings. The numbers on screen contradict each other: the headline reads $150.00, the scenario badges read $314.8K / $291.4K / $232.1K, and every gridline on the vertical axis reads "$0K". The past-price line barely moves, which does not match how the coin actually traded. A user who compares this screen against any real price source loses trust in the whole dashboard within seconds.

This change makes the projections page a **coin price page**. It shows the genuine recent price history of one selected coin, followed by three forecast scenarios — optimistic, likely, and pessimistic — with every number on screen consistent with every other number. Portfolio value, holdings, and profit/loss move out of this page entirely and become their own separate feature.

**Success looks like:** A user opens the projections page, sees SOL at its real current price, sees the last week of real price movement matching what they'd see on any price site, flips the range control to look a month further ahead, and reads three scenario endpoints with a percentage difference from today — all without spotting a single number that doesn't add up.

---

## 2. Functional Requirements (The "What")

### 2.1 — The Page Is About One Coin's Price

**As a** user, **I want** the chart to show the price of the coin I selected, **so that** I know exactly what I'm looking at.

**Acceptance Criteria:**

- [ ] The panel is titled to describe a **coin price forecast**, not a portfolio projection
- [ ] The chart line shows the price in US dollars of the coin selected in the BTC / ETH / SOL tabs
- [ ] Switching tabs redraws the chart, headline, scenario badges, axis, tooltip, confidence score and reasoning for the newly selected coin
- [ ] No portfolio value, holdings quantity, cost basis or profit/loss figure appears anywhere on this page

---

### 2.2 — Real Price History

**As a** user, **I want** the past-price part of the chart to be genuine market data, **so that** I can trust the forecast attached to it.

**Acceptance Criteria:**

- [ ] The history line reflects the coin's actual traded prices, matching a public price source to within normal rounding
- [ ] The shape of the line shows real movement — rises, dips and volatility — not a near-flat placeholder line
- [ ] The most recent point of the history line meets the current price shown in the headline
- [ ] History is available for at least the past year for each of the three coins

---

### 2.3 — Three Forecast Scenarios

**As a** user, **I want** to see an optimistic, likely and pessimistic path, **so that** I understand the range of outcomes rather than a single number.

**Acceptance Criteria:**

- [ ] The forecast area shows three distinct lines: **Bull** (green, dashed), **Base** (violet, solid), **Bear** (red, dashed)
- [ ] A soft, semi-transparent band fills the space between the bull and bear lines
- [ ] A vertical "Today" marker separates past prices from forecast
- [ ] All three forecast lines start from today's real price — none of them begins at a value the coin is not currently trading at
- [ ] A legend identifies Bull case / Base case / Bear case by colour

---

### 2.4 — Separate Range Control for History and Forecast

**As a** user, **I want** to set how far back and how far forward the chart reaches independently, **so that** I can zoom in on recent action without losing the long-term outlook (or the reverse).

**Acceptance Criteria:**

- [ ] The range control offers: **1W · 1M · 3M · 6M · 1Y** (the "All" option is removed)
- [ ] A further button, visually distinct from the range options, sits at the end of the row and switches which side of the chart the range applies to: **History** or **Forecast**
- [ ] Both the past prices and the three forecast scenarios are **always drawn on the chart**, no matter which side the toggle is set to
- [ ] With the toggle on History, clicking 1W sets the past section to the last 7 days and leaves the forecast section unchanged
- [ ] With the toggle on Forecast, clicking 1M sets the forecast section to one month ahead and leaves the past section unchanged
- [ ] Each side remembers its own selected range; switching the toggle back shows that side's range still highlighted
- [ ] The currently active side is obvious at a glance — the user can always tell which half the range buttons will affect

---

### 2.5 — Scrollable Chart When the Span Doesn't Fit

**As a** user, **I want** to reach every part of a long span, **so that** picking a wide range doesn't squash the chart into an unreadable smear.

**Acceptance Criteria:**

- [ ] When the combined past + forecast span is too wide to display legibly, the chart becomes horizontally scrollable rather than compressing everything into the visible width
- [ ] Scrolling moves the chart only — the page around it does not scroll sideways
- [ ] The date labels along the bottom stay aligned with the line as the user scrolls
- [ ] When the span fits comfortably, no scrolling appears

---

### 2.6 — Readable Vertical Axis

**As a** user, **I want** the price axis to tell me actual price levels, **so that** I can read a value off the chart without hovering.

**Acceptance Criteria:**

- [ ] Axis labels show real prices spanning the values currently visible (e.g. $120 / $135 / $150 / $165) — never a repeated "$0K"
- [ ] The scale adapts per coin: a coin trading in the tens of thousands and a coin trading in the hundreds are both labelled sensibly
- [ ] The scale adapts to the selected ranges, so the visible lines fill the chart height instead of sitting in a flat strip
- [ ] Large values are abbreviated readably (e.g. $118.4K) and small values keep enough decimal places to be meaningful

---

### 2.7 — Headline Price and Change

**As a** user, **I want** a single clear number at the top, **so that** I get the current state at a glance.

**Acceptance Criteria:**

- [ ] The headline shows the current live price of the selected coin
- [ ] Beside it, the change in dollars and percent over **exactly the history range currently selected**
- [ ] A caption states the comparison period in plain words matching that range (e.g. "vs 7 days ago" when 1W is selected)
- [ ] Gains are shown in green with a "+", losses in red with a "−"
- [ ] Changing the history range or the coin updates the headline immediately

---

### 2.8 — Scenario Badges

**As a** user, **I want** the endpoint of each scenario called out, **so that** I can read the outcome range without hovering.

**Acceptance Criteria:**

- [ ] Three badges — Bull, Base, Bear — sit alongside their lines
- [ ] Each badge shows that scenario's price **at the end of the currently selected forecast range** plus its percentage difference from today's price (e.g. "Bull · $198.40 · +32%")
- [ ] Badge colours match their lines
- [ ] Badge values update when the forecast range, the coin, or the forecast itself changes
- [ ] Badge figures agree with the hover tooltip at the same date and with the vertical axis scale

---

### 2.9 — Hover Tooltip

**As a** user, **I want** exact figures for a specific date, **so that** I can inspect any point on the chart.

**Acceptance Criteria:**

- [ ] Hovering the past section shows the date and the real price on that date
- [ ] Hovering the forecast section shows the date and all three scenario prices for it
- [ ] Tooltip figures use the same currency formatting as the axis and badges
- [ ] The tooltip follows the pointer and never covers the point being inspected

---

### 2.10 — Loading and Failure Behaviour

**As a** user, **I want** to be told when what I'm looking at may be out of date, **so that** I don't act on stale numbers unknowingly.

**Acceptance Criteria:**

- [ ] On first load with nothing to show yet, the chart area shows a pulsing placeholder
- [ ] If fresh market data cannot be retrieved, the most recently loaded data stays on screen — the chart does not blank out
- [ ] In that case a visible warning appears stating the data may be outdated and how old it is, with a way to retry
- [ ] The warning clears automatically once fresh data loads successfully
- [ ] The chart never displays invented or placeholder prices in place of real ones

---

## 3. Scope and Boundaries

### In-Scope

- Recasting the projections page as a **single-coin price** page (BTC / ETH / SOL tabs)
- Real price history for each coin, covering at least the past year
- Bull / Base / Bear forecast scenarios anchored to today's real price
- Range control of 1W / 1M / 3M / 6M / 1Y with the "All" option removed
- A separate-styled toggle deciding whether the range applies to history or to forecast, with both halves always visible and each remembering its own range
- Horizontal scrolling when the chosen span is too wide to read
- Vertical axis showing real, coin-appropriate, range-appropriate price labels
- Headline price with change over the selected history range
- Scenario badges showing end-of-forecast price and percentage vs today
- Hover tooltip for past prices and for all three scenarios
- Loading placeholder, last-known-data fallback, and stale-data warning

### Out-of-Scope

- **All portfolio functionality** — total value, holdings, cost basis, unrealized profit/loss and allocation move to a **separate Portfolio feature and page**, specified on its own
- **Live Price Ticker** (Phase 2) — streaming real-time price updates onto the chart
- **Real Holdings & P&L** (Phase 3)
- **Models Explorer** (Phase 3) — model accuracy, hit rate and confidence comparison
- Coins beyond BTC, ETH and SOL on this chart
- Drawing tools, technical indicators, or overlaying two coins on one chart
- Changing how forecasts are generated, or the AI service/model settings and saved snapshots already covered by spec 003
