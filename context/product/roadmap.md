# Product Roadmap: Catoshi

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

---

### Phase 1 — Live Data Foundation

_Replace the mocked UI with real, auto-refreshing market data. The app becomes genuinely useful for the first time._

- [x] **Live Asset Prices**
  - [x] **KPI Cards & Asset List:** Display real-time USD prices and 24h changes for key assets on the main dashboard, refreshing automatically every 60 seconds with skeleton loading and stale-data warnings.
  - [x] **Historical Price Chart:** Replace the mocked portfolio chart with real historical price data, allowing users to see how assets have moved over the past 30–365 days.
  - [x] **Asset List with Live Sparklines:** Populate the watchlist/asset table with live prices, 24h changes, and mini trend sparklines.

---

### Phase 2 — Signals & Real-Time Intelligence

_Give users the "why" behind the numbers — news-driven signals and a live price ticker._

- [x] **AI / Market Signals Feed**
  - [x] **Live Signals from Market State (spec 014):** Real bullish/bearish/neutral signals derived deterministically from the hourly market-state snapshot store (RSI, funding, OI, ETF flows, volume, MA compression, Fear & Greed), generated inside the collection run and persisted.
  - [ ] **Live Signals from News Sources:** _Not built._ Spec 002 assumed news-headline signals classified by an LLM; that data layer never existed. News-sourced signals answer "why it moved" (which market state cannot) and are scoped to a later spec.

- [ ] **Live Price Ticker**
  - [ ] **Real-Time Chart Ticker:** Stream live price updates for BTC, ETH, and SOL directly on the main chart, reconnecting automatically on disconnect.

---

### Phase 3 — Portfolio & Advanced Analytics

_Make the dashboard personal — show users how their own holdings are performing._

- [ ] **Portfolio Overview**
  - [ ] **Real Holdings & P&L:** Calculate and display portfolio total value, cost basis, unrealized P&L, and allocation breakdown from real asset prices.

- [ ] **Projections & Models**
  - [x] **Forecasting with Real Data:** Power the projections and scenario-planning pages with live price inputs and model-driven forecasts.
  - [ ] **Models Explorer:** Surface the AI/quantitative models behind signals and projections, showing accuracy, hit rate, and confidence scores.
