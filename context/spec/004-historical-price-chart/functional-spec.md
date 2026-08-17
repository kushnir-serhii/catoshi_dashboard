# Functional Specification: Historical Price Chart

- **Roadmap Item:** Historical Price Chart — Replace the mocked portfolio chart with real historical price data, allowing users to see how assets have moved over time.
- **Status:** Draft
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The main chart on the Catoshi dashboard currently displays placeholder data that bears no relation to real market prices. For a user like Alex — someone who checks the dashboard as part of their daily market routine — a chart with fake data provides zero analytical value. It looks like a chart, but it cannot answer the only question that matters: *"How has this asset actually moved over the past week, month, or year?"*

This feature replaces the placeholder with a real, interactive price history chart. Users gain an at-a-glance understanding of an asset's price trend across multiple time frames, directly on their main screen — without opening a separate tool.

**Success looks like:** A user opens Catoshi, glances at the chart, and immediately understands whether Bitcoin is up or down over the past month and how it got there.

---

## 2. Functional Requirements (The "What")

### 2.1 Chart Display

- The main dashboard displays a smooth area chart showing the price history of a selected asset.
- The vertical axis represents price (in USD). The horizontal axis represents time.
- The chart fills its container and is clearly readable at typical laptop and desktop screen sizes.

**Acceptance Criteria:**
- [ ] When the user opens the dashboard, a smooth area chart is visible in the main chart area.
- [ ] The chart clearly shows price on the vertical axis and time on the horizontal axis.

---

### 2.2 Default State (First Visit)

- On a user's very first visit (no prior selections saved), the chart displays **Bitcoin (BTC)** price history for the **last 30 days (1M)** by default.

**Acceptance Criteria:**
- [ ] Given the user has never used the app before, when they open the dashboard, the chart shows Bitcoin price history for the last 30 days.

---

### 2.3 Remembered Selection

- After the user changes the asset or time range, that selection is saved. The next time they open the dashboard, the chart loads with their last-used asset and time range.

**Acceptance Criteria:**
- [ ] Given the user previously viewed Ethereum on the 3M range, when they close the tab and reopen the app, the chart shows Ethereum price history for the last 3 months.

---

### 2.4 Time Range Selector

- A row of clearly labelled range buttons is displayed above or below the chart: **1D, 7D, 1M, 3M, 1Y**.
- The currently active range is visually distinguished from the inactive options (e.g. highlighted or underlined).
- Tapping a range button immediately reloads the chart for that time window.

| Label | What it shows |
|-------|--------------|
| 1D | Last 24 hours |
| 7D | Last 7 days |
| 1M | Last 30 days |
| 3M | Last 3 months |
| 1Y | Last 365 days |

**Acceptance Criteria:**
- [ ] Five range buttons (1D, 7D, 1M, 3M, 1Y) are visible alongside the chart.
- [ ] The selected range button looks visually different from the others.
- [ ] When the user clicks a different range, the chart updates to show data for that time window.

---

### 2.5 Asset Selector

- A search/select control near the chart allows the user to change which asset the chart displays.
- The list includes all assets available on the Markets page — the user is not limited to a fixed set.
- When the user selects a different asset, the chart immediately updates to show that asset's price history for the currently selected time range.

**Acceptance Criteria:**
- [ ] An asset selector is visible near the chart.
- [ ] The selector includes all assets available on the Markets page.
- [ ] When the user selects a different asset, the chart updates to show that asset's history for the current time range.
- [ ] The chart title or label updates to reflect the newly selected asset.

---

### 2.6 Hover Tooltip

- When the user moves their cursor (or finger on touch) over the chart, a tooltip follows the pointer and displays the **exact price** and **the date (and time for 1D)** at that point.
- The tooltip disappears when the cursor leaves the chart area.

**Acceptance Criteria:**
- [ ] When the user hovers over any point on the chart, a tooltip appears showing the price in USD and the corresponding date.
- [ ] On the 1D range, the tooltip shows the time as well as the date.
- [ ] The tooltip disappears when the user moves the cursor off the chart.

---

### 2.7 Loading State

- While the chart is fetching data (on initial load, after switching assets, or after switching time range), the chart area displays animated skeleton bars in place of the actual chart.
- The range selector and asset selector remain visible but non-interactive during loading.

**Acceptance Criteria:**
- [ ] When the user switches to a different asset or time range, animated placeholder bars appear in the chart area while data loads.
- [ ] The range and asset controls are visible but cannot be clicked again until loading completes.

---

### 2.8 Error State

- If the price data cannot be loaded (for any reason), the chart area displays a clear error message and a **Retry** button.
- Clicking Retry attempts to reload the data for the current asset and time range.

**Acceptance Criteria:**
- [ ] When data fails to load, the chart area shows an error message (e.g., "Could not load price data") and a Retry button.
- [ ] Clicking Retry attempts to reload the chart data.
- [ ] If the retry succeeds, the chart displays normally.
- [ ] If the retry also fails, the error message and Retry button remain visible.

---

## 3. Scope and Boundaries

### In-Scope

- Displaying real historical price data for any asset from the Markets list.
- Time range selector with options: 1D, 7D, 1M, 3M, 1Y.
- Asset selector covering the full Markets list.
- Remembering the user's last-selected asset and time range across visits.
- Smooth area chart with hover tooltip (price + date/time).
- Loading skeleton and inline error state with Retry.

### Out-of-Scope

The following are separate roadmap items and will be addressed in their own specifications:

- **Live price sparklines** in the asset list / watchlist table.
- **Real-time price ticker** streaming live prices onto the chart as they happen (Phase 2 roadmap item).
- **Portfolio P&L overlay** — showing cost basis or unrealised gains on the chart.
- **AI-driven projections overlay** — forecast lines on the chart (Phase 3 roadmap item).
- **Candlestick / OHLC chart** view — this spec covers area/line only.
- **Drawing tools** or any user annotation on the chart.
