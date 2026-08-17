# Functional Specification: Asset List with Live Sparklines

- **Roadmap Item:** Phase 1 — Live Asset Prices > Asset List with Live Sparklines
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The Markets page currently lacks a way for users to compare multiple assets side by side at a single glance. While the summary cards and chart show live data, there is no table where a user can survey all tracked assets simultaneously — seeing each one's price, daily movement, volumes, and recent trend in one view.

Without this, users must check assets one by one or fall back to external sites like CoinGecko — defeating the purpose of Catoshi as a single-tab replacement. This feature gives users a live, always-refreshing asset table where each row tells the complete story of an asset at a glance.

**Success looks like:** A user opening the Markets page and immediately comparing the top 10 crypto assets by market cap — price, 24h change, market cap, volume, and a 7-day mini trend chart — all on one screen, without navigating anywhere else.

---

## 2. Functional Requirements (The "What")

### 2.1 The Asset Table

The Markets page displays a table listing the top 10 assets ranked by market cap. Each row contains:

- **Asset** — The asset's name and its logo/icon.
- **Price** — The current price in US dollars.
- **24h Change** — The percentage price change over the past 24 hours. Green when positive, red when negative.
- **Market Cap** — The total market value of the circulating supply, in USD.
- **24h Volume** — The total amount traded over the last 24 hours, in USD.
- **7-Day Trend** — A small chart (sparkline) showing the asset's price movement over the past 7 days. The line is green if today's price is higher than 7 days ago, red if lower.

**Acceptance Criteria:**
- [x] The Markets page shows a table with one row per asset for the top 10 assets by market cap.
- [x] Each row shows: name with logo, USD price, 24h % change (green/red), market cap, 24h volume, and a 7-day sparkline.
- [x] The sparkline line colour reflects the 7-day direction — green if higher than 7 days ago, red if lower.

---

### 2.2 Automatic Refresh

The price, 24h change, market cap, and volume values refresh automatically every 60 seconds — matching the summary cards — so the table stays in sync without any user action. The sparklines load once when the page opens and do not change until the page is reloaded.

**Acceptance Criteria:**
- [x] All price, change, volume, and market cap values update automatically every 60 seconds without a page reload.
- [x] Sparklines load on page open and do not refresh on subsequent 60-second ticks.

---

### 2.3 Loading State

When the page first loads and data has not yet arrived, the table displays animated placeholder rows — one per asset — in place of real content, matching the skeleton loading behaviour of the summary cards.

**Acceptance Criteria:**
- [x] On first load, the table shows 10 animated skeleton rows while waiting for data.
- [x] Skeleton rows are replaced by real data as soon as the first response arrives.

---

### 2.4 Stale or Failed Data

If data cannot be refreshed within the expected window, a stale-data warning appears — consistent with the existing summary card behaviour. The last-known values remain visible; the table does not go blank.

**Acceptance Criteria:**
- [x] A visible stale-data warning appears on or near the table when data is overdue.
- [x] The warning disappears once a successful refresh occurs.
- [x] Last-known values remain visible during the stale state.

---

### 2.5 Sortable Columns

The user can click any column header to sort the table. The first click sorts ascending; a second click reverses to descending. A visual arrow on the header shows which column is active and its direction. By default, assets are ordered by market cap from largest to smallest.

**Acceptance Criteria:**
- [x] Clicking any column header sorts the table by that column in ascending order.
- [x] Clicking the same header again reverses the sort to descending.
- [x] The active column header shows a directional arrow indicating sort order.
- [x] The default order (no column selected) is market cap descending — largest asset first.

---

## 3. Scope and Boundaries

### In-Scope

- A table on the Markets page listing the top 10 assets by market cap.
- Per-row data: name + logo, USD price, 24h % change (coloured), market cap, 24h volume, and a 7-day sparkline.
- Automatic price/change/volume/cap refresh every 60 seconds.
- Sparklines loaded once on page open.
- Skeleton loading rows on initial page load.
- Stale-data warning when data is overdue.
- Sortable columns — any column, toggleable ascending/descending, defaulting to market cap descending.

### Out-of-Scope

- **User-configurable watchlist** — Users cannot add or remove assets from the table.
- **Real-time streaming ticker** — Tick-by-tick live price streaming is a separate roadmap item (Live Price Ticker).
- **Portfolio P&L per asset** — Cost basis, unrealized gains, and allocation per row belong to the Portfolio Overview feature.
- **Models Explorer** — AI model accuracy and confidence scores per asset are a separate roadmap item.
- **Mobile app** — Web-only per the overall product scope.
