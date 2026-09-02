# Product Definition: Catoshi

- **Version:** 2.0
- **Status:** Active
- **Revised:** 02.09.2026 — scope narrowed to forecasting and signals; all portfolio,
  wallet and personal-data features moved out of scope (see §3.2).

---

## 1. The Big Picture (The "Why")

### 1.1. Project Vision & Purpose

To give a crypto market watcher one screen that answers three questions honestly:
**what is the market doing right now**, **what changed that matters**, and **where do the
models think it goes next — and how often have they been right?**

Catoshi is not a portfolio tracker. It is a forecasting instrument that keeps score of
itself. Every number on the screen is either measured or explicitly labelled as absent.

### 1.2. Target Audience

Self-directed crypto market watchers who already follow prices and news, and who want
context — signals, projections, and a track record for those projections — without
handing any personal or financial data to a third party.

### 1.3. User Personas

- **Persona 1: "Alex the Self-Directed Investor"**
  - **Role:** Software engineer by day, active crypto market watcher in their own time.
  - **Goal:** Wants one place to see the market state, what news is likely to move it, and
    model-driven projections with a visible hit rate.
  - **Frustration:** Every forecasting product he has tried shows a confident accuracy
    figure and no way to check it. He wants the score, not the claim.
  - **Constraint:** Will not connect a wallet or an exchange key to a side project.

### 1.4. Success Metrics

- The Models Explorer shows a **real, resolved-forecast Brier score** that improves month
  over month, grouped by `model` + `prompt_version`.
- The Signals feed shows a signal within one hour of the market state that produced it,
  and its displayed age is the true age of the underlying snapshot.
- A visitor can answer "should I trust this projection?" from the product itself, without
  asking the author.
- Zero surfaces that show a number the system did not measure.

---

## 2. The Product Experience (The "What")

### 2.1. Core Features

- **Live Market Prices** — Real-time, auto-refreshing prices, 24h change, volume and
  market cap for the tracked assets (BTC, ETH, SOL).
- **Market-State Signals** — Deterministic bullish / bearish / neutral signals derived from
  the hourly market-state snapshot store: RSI, funding, open interest, long/short ratio,
  ETF flows, volume z-score, MA compression, Fear & Greed. Rules are pure functions, unit
  tested, and every signal is traceable to the snapshot that produced it. (Spec 014.)
- **News Impact Signals** — Crypto news headlines classified by an LLM for **impact**:
  which way, how hard, over what horizon, and **whether it hits the whole market or one
  specific coin**. Each classified item is stored with its source link, its
  `prompt_version`, and an asserted direction so it can later be scored like a forecast.
  (Spec 015.)
- **Projections & Forecasting** — Model-driven price projections with bull / base / bear
  scenarios and explicit probabilities, generated from a computed market snapshot rather
  than from raw candles.
- **Models Explorer** — The track record. One row per provider + model + prompt version,
  with resolved-forecast counts, hit rate, Brier score, and a regime breakdown showing
  which market conditions the forecaster handles badly. Empty until enough forecasts have
  resolved. (Spec 011.)
- **Historical Analogs** — *Conditional.* "Has this setup happened before, and what
  followed?" answered from stored snapshots as measured base rates. Only built if the
  falsification test shows the method has signal and the data has power. (Spec 012.)

### 2.2. User Journey

A user opens Catoshi and lands on Projections. They see the current scenario bands for
BTC, ETH and SOL with probabilities, and the age of the snapshot they were computed from.
They open Signals and see what the market state flagged in the last hour, mixed with
classified news — a regulatory headline tagged as market-wide bearish over 7 days, an
ETH-specific upgrade headline tagged as asset-scoped bullish. They open Models to check
whether this forecaster has earned any trust: 84 resolved forecasts, a real Brier score,
and a note that it is systematically overconfident in high-RSI regimes. They close the
tab knowing exactly how much weight the screen deserves.

No account. No wallet. No holdings.

---

## 3. Project Boundaries

### 3.1. What's In-Scope for this Version

- Live USD prices, 24h change, volume and market cap for BTC / ETH / SOL (CoinGecko).
- Auto-refreshing KPI cards and asset list with skeleton loading and true stale-data
  warnings.
- Hourly market-state snapshot collection into Neon Postgres, with a backfill of the
  price-side history.
- Market-state signals feed, generated deterministically inside the collection run.
- News impact classification: scope (market-wide vs specific asset), direction, magnitude,
  horizon, confidence, source link.
- Price projections and scenario planning with model-driven forecasts and explicit
  probabilities.
- Forecast persistence, resolution against real prices, and Brier scoring.
- Models Explorer built entirely on those measurements.
- Historical price chart with coin search.
- A landing page that describes only what the product actually does.
- Deployment on Vercel with hourly GitHub Actions collection and a weekly database dump.

### 3.2. What's Out-of-Scope (Non-Goals)

Everything in this list is **deliberately removed**, not deferred by accident. Spec 016
deletes the code and copy that implies otherwise.

- **Portfolio and holdings** — No holdings entry, cost basis, unrealized P&L, allocation
  breakdown, rebalancing or tax-lot tracking. The Portfolio page, `HoldingsPanel`,
  `HoldingsDonut` and `src/data/portfolio.ts` are removed.
- **Wallet and exchange connections** — No wallet addresses, no read-only exchange API
  keys, no balance syncing. Any landing copy promising this is removed.
- **Any personal data** — No user accounts, no sign-up, no login, no email capture, no
  per-user storage on the server. The product is anonymous and read-only.
- **Pricing, plans and billing** — No paid tiers, no trial, no "talk to sales". The landing
  page pricing section is removed, along with the invented traction statistics.
- **Social / sharing features** — No sharing, following, or social feed.
- **Mobile app** — Web only.
- **Trading, execution or recommendations** — The product describes probabilities and base
  rates. It never tells anyone to buy or sell, and every forecast surface carries a
  non-financial-advice disclaimer.
- **Alerting** — No email or push alerts in this version.

### 3.3. Boundary Test

If a proposed feature needs to know *who the user is* or *what they own*, it is out of
scope. If it needs only *what the market did*, it is in scope.
