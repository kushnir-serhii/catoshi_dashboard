# Functional Specification: Live Asset Prices — KPI Cards & Asset List

- **Roadmap Item:** Step 1 — Replace mocked price data with live crypto prices on the main dashboard
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The Catoshi dashboard currently displays hardcoded, static numbers for asset prices, market capitalisation, and 24-hour price changes. This means the data is never accurate and provides no real value to a user trying to understand the current state of the market.

This change connects the KPI cards and asset list on the main dashboard to live market data, so the numbers the user sees reflect real, up-to-date prices. The dashboard will automatically refresh every 60 seconds — no manual reload required.

**Success looks like:** A user opens the dashboard and immediately sees accurate, live prices for Bitcoin, Ethereum, and Solana. The numbers update quietly in the background every minute, and the user always knows how fresh the data is.

---

## 2. Functional Requirements (The "What")

### 2.1 KPI Cards — Live Prices

- **As a** dashboard user, **I want to** see the current price and 24-hour change for each featured asset, **so that** I can immediately understand how the market is performing without leaving the page.
  - **Acceptance Criteria:**
    - [x] Each KPI card displays the asset's current price in USD.
    - [x] Each KPI card displays the percentage change over the last 24 hours, styled consistently with the existing dashboard colour scheme (positive and negative values are visually distinct).
    - [x] The three default assets shown are Bitcoin (BTC), Ethereum (ETH), and Solana (SOL).
    - [x] On first page load, while prices are being fetched, each KPI card shows animated skeleton placeholders (grey pulsing bars) in place of the numbers.
    - [x] Once data has loaded, the skeleton placeholders are replaced by the actual price values.

### 2.2 Asset List — Live Prices

- **As a** dashboard user, **I want to** see live prices in the asset list on the main dashboard, **so that** the list reflects the real market and not stale mock values.
  - **Acceptance Criteria:**
    - [x] The asset list displays the current USD price for each listed asset.
    - [x] The 24-hour change column is populated with live percentage values, styled to match the KPI cards.
    - [x] While data is loading on first visit, the list rows show skeleton placeholders.

### 2.3 Automatic Refresh

- **As a** dashboard user, **I want** prices to update automatically, **so that** I don't need to refresh the browser to see current data.
  - **Acceptance Criteria:**
    - [x] Prices refresh automatically every 60 seconds without any user action.
    - [x] A visible countdown indicator (timer or progress bar) shows how many seconds remain until the next refresh.
    - [x] When a refresh occurs, the new values replace the old ones smoothly — the entire card does not flash or re-show skeleton loaders on subsequent refreshes, only on the initial page load.

### 2.4 Error State — Data Unavailable

- **As a** dashboard user, **if** the price data cannot be fetched (e.g. network issue), **I want** to be informed without the dashboard breaking, **so that** I understand the data may be stale.
  - **Acceptance Criteria:**
    - [x] If a refresh fails, the last successfully fetched prices remain visible on the cards and in the list.
    - [x] A subtle warning message or badge appears near the affected data (e.g. "Data may be outdated") to indicate the values are not current.
    - [x] The warning disappears automatically once a successful refresh completes.
    - [x] The countdown timer continues running and retries the refresh on its next tick.

---

## 3. Scope and Boundaries

### In-Scope

- Live USD prices on KPI cards (BTC, ETH, SOL — fixed default set)
- Live 24-hour percentage change on KPI cards
- Live prices and 24-hour change in the main asset list
- Skeleton loading state on initial page load
- Automatic 60-second refresh with a visible countdown
- Subtle stale-data warning when a refresh fails

### Out-of-Scope

- **User-configurable asset selection** — which assets appear is fixed in this step; customisation is a separate future feature
- **Historical chart data** — replacing the portfolio chart with real data is a separate step
- **Live price ticker on the chart** — the real-time streaming ticker is handled in a later step
- **News and signal cards** — connecting the signals feed to real data is a separate step
- **Portfolio allocation calculations** — computing real holdings value is a separate step
