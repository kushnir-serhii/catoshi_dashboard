# Functional Specification: Historical Price Chart

- **Roadmap Item:** Phase 1 — Live Asset Prices → Historical Price Chart
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The main dashboard currently displays a placeholder chart that shows no real price data. As a result, users who want to understand how an asset has trended over the past week, month, or year must still open a separate tool like TradingView — defeating the core promise of Catoshi as a single, unified view.

This feature replaces the placeholder with a real, interactive area chart showing genuine historical price data. It gives users the *context* behind the numbers they already see in the live price cards: not just "BTC is $65,000 today," but "BTC rose from $52,000 over the past 30 days."

**Success looks like:** A user lands on the dashboard, selects a 90-day view for Ethereum, and immediately understands the recent trend — without opening another tab.

---

## 2. Functional Requirements (The "What")

### 2.1 Asset Selection

- The chart area includes a selector (e.g., a dropdown) that lists the assets available in the dashboard.
- The user can choose **one asset at a time**.
- Selecting a different asset immediately updates the chart to show that asset's price history for the currently selected time range.

**Acceptance Criteria:**
- [x] Given the chart is visible, when the user opens the asset selector, they see a list of the available assets.
- [x] When the user selects an asset from the list, the chart updates to show that asset's historical price data within 2 seconds.
- [x] Only one asset is displayed on the chart at a time.

---

### 2.2 Time Range Selection

- Near the chart, there are four clearly labeled time-range options: **7D**, **30D**, **90D**, and **1Y**.
- The selected range is visually highlighted so the user knows which period is active.
- Selecting a range immediately refreshes the chart to show that period.

**Acceptance Criteria:**
- [x] Given the chart is visible, the user can see exactly four time-range options: 7D, 30D, 90D, 1Y.
- [x] The currently active range is visually distinct from the others (e.g., highlighted or underlined).
- [x] When the user selects a different range, the chart updates to reflect the new period within 2 seconds.

---

### 2.3 Chart Display

- The chart uses an **area style** — a smooth curve with a filled area beneath it — representing the asset's closing price in USD over the selected time range.
- The vertical axis shows price in USD. The horizontal axis shows dates corresponding to the selected range.

**Acceptance Criteria:**
- [x] The chart displays price data as a filled area curve, not as bars or candlesticks.
- [x] The vertical axis is labelled in USD.
- [x] The horizontal axis shows dates that correspond to the selected time range.

---

### 2.4 Hover Tooltip

- When the user moves their cursor over the chart, a tooltip appears near the cursor.
- The tooltip shows:
  - The asset's **price in USD** at that point in time.
  - The **date** corresponding to that point.
- When the cursor leaves the chart, the tooltip disappears.

**Acceptance Criteria:**
- [x] Given the chart is displayed, when the user hovers over a point on the chart, a tooltip appears showing a price in USD and a date.
- [x] The tooltip updates as the user moves the cursor along the chart.
- [x] When the cursor moves off the chart area, the tooltip disappears.

---

### 2.5 Remembered Selection (Persistent State)

- When the user returns to the dashboard, the chart automatically restores the last asset and time range they had selected in a previous session.
- On a user's **very first visit** (no prior selection recorded), the chart defaults to **BTC at 30 days**.

**Acceptance Criteria:**
- [x] Given a user previously selected "ETH" and "90D," when they return to the dashboard (new tab or browser restart), the chart shows ETH at 90 days without any interaction.
- [x] Given a user is visiting for the first time, the chart shows BTC price history for the past 30 days by default.

---

### 2.6 Loading State

- While historical price data is being fetched (on page load, on asset change, or on range change), the chart area shows an animated grey skeleton placeholder.
- Once data is ready, the skeleton is replaced by the chart.

**Acceptance Criteria:**
- [x] When the user selects a new asset or time range, an animated skeleton placeholder appears in the chart area immediately.
- [x] Once data has loaded, the skeleton is replaced by the populated chart.
- [x] The skeleton is the same size and shape as the chart area it replaces, so the layout does not shift.

---

### 2.7 Error State

- If the price history data fails to load (e.g., due to a network issue), the skeleton is replaced by an error message inside the chart area.
- The error state includes a **Retry** button. Clicking it attempts to load the data again and shows the skeleton while retrying.

**Acceptance Criteria:**
- [x] Given data fails to load, the chart area displays an error message and a "Retry" button — not a blank or broken chart.
- [x] When the user clicks "Retry," the skeleton loading state appears again while the data is re-fetched.
- [x] If the retry succeeds, the chart is displayed normally.
- [x] Error message text: "Failed to load price history." (resolved during implementation)

---

## 3. Scope and Boundaries

### In-Scope

- Area chart showing historical closing prices for one asset at a time.
- Asset selector allowing the user to choose which asset to view.
- Four time-range options: 7D, 30D, 90D, 1Y.
- Hover tooltip showing price (USD) and date.
- Remembered last-selected asset and time range across sessions; default to BTC/30D on first visit.
- Animated skeleton loading state.
- Error state with a Retry button.

### Out-of-Scope

The following are separate roadmap items and will be addressed in their own specifications:

- **Asset List with Live Sparklines** — mini trend lines inside the asset table (Phase 1, separate item).
- **Live Price Ticker** — real-time streaming price updates on the chart (Phase 2).
- **Portfolio Overview & P&L** — personal holdings performance (Phase 3).
- **Projections & Models** — model-driven forecasts (Phase 3).

The following are explicitly not part of this item:

- Candlestick or OHLC chart styles.
- Comparing multiple assets simultaneously on one chart.
- Exporting or downloading chart data.
