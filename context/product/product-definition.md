# Product Definition: Catoshi

- **Version:** 1.0
- **Status:** Proposed

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

To give individual crypto investors a single, unified dashboard that replaces the five browser tabs they currently keep open — combining live prices, portfolio analytics, AI-driven signals, and market projections in one place, so they spend less time context-switching and more time making informed decisions.

### 1.2. Target Audience

Self-directed individual crypto investors who actively track their holdings and monitor the market but are frustrated by fragmented tools scattered across multiple websites and apps.

### 1.3. User Personas

- **Persona 1: "Alex the Self-Directed Investor"**
  - **Role:** Software engineer by day, active crypto investor in their own time.
  - **Goal:** Wants a single place to see live prices, portfolio performance, market signals, and AI projections without switching between CoinGecko, TradingView, and exchange apps.
  - **Frustration:** Spends more time hunting for data across tabs than actually analysing it. Wants context (signals, projections) alongside raw prices.

### 1.4. Success Metrics

- Users return to the Catoshi dashboard daily as part of their routine — it becomes their default market check-in.
- The dashboard replaces at least two previously separate tools (e.g. a price tracker and a news/signals feed) for the majority of users.
- Time-to-insight (from opening the app to understanding the current state of a portfolio) is under 30 seconds.

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- **Live Market Prices** — Real-time and auto-refreshing prices, 24h changes, volume, and market cap for key assets.
- **Portfolio Overview** — Holdings summary with cost basis, current value, unrealized P&L, and allocation breakdown.
- **AI Signals** — Curated bullish/bearish/neutral signals drawn from crypto news RSS feeds and Reddit sentiment, classified by AI and updated regularly.
- **Projections & Forecasting** — Model-driven price projections and scenario planning for tracked assets.
- **Models Explorer** — View and compare the AI/quantitative models that power the signals and projections.

### 2.2. User Journey

A user opens Catoshi and lands on the main dashboard. They immediately see live prices and 24h changes for their key assets on the KPI cards, and a price chart showing recent performance. They glance at the Signals page to check if any new bullish or bearish signals have emerged since yesterday. They review the Projections page to see where models expect BTC and ETH to move over the next 30 days. They check the Portfolio page to see today's P&L against their cost basis. All without opening a single other tab.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- Live USD prices, 24h change, volume, and market cap on the Markets page (powered by CoinGecko).
- Auto-refreshing KPI cards and asset list with skeleton loading and stale-data warnings.
- Portfolio holdings view with cost basis, current value, and unrealized P&L.
- AI/market signals feed (powered by crypto news RSS feeds via an RSS-to-JSON bridge, combined with Reddit sentiment) with bullish/bearish/neutral tagging.
- Price projections and scenario planning with model-driven forecasts.
- A live price ticker on the main chart for BTC, ETH, and SOL (powered by Binance WebSocket).
- Landing/marketing page.

### 3.2. What's Out-of-Scope (Non-Goals)

- **Social / sharing features** — No sharing portfolios, following other users, or social feed.
- **User accounts / authentication** — No sign-up or login in v1; the dashboard is a single-user local experience.
- **Mobile app** — Web-only; no React Native or dedicated mobile experience.
- **Exchange integrations** — No direct API connections to exchanges for live balance syncing; portfolio is manually configured.
- **Tax calculation** — No cost-basis tracking for tax purposes or tax reporting.
