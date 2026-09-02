# Product Roadmap: Catoshi

_This roadmap outlines our strategic direction based on customer needs and business goals. It focuses on the "what" and "why," not the technical "how."_

_Revised 02.09.2026. Scope narrowed to forecasting and signals — portfolio, wallet and
personal-data features are removed, not deferred (see `product-definition.md` §3.2).
Phases 1–6 below carry the project to done; there is no Phase 7._

---

### Phase 1 — Live Data Foundation

_Replace the mocked UI with real, auto-refreshing market data. The app becomes genuinely useful for the first time._

- [x] **Live Asset Prices**
  - [x] **KPI Cards & Asset List:** Display real-time USD prices and 24h changes for key assets on the main dashboard, refreshing automatically every 60 seconds with skeleton loading and stale-data warnings. _(spec 001)_
  - [x] **Historical Price Chart:** Replace the mocked portfolio chart with real historical price data, allowing users to see how assets have moved over the past 30–365 days. _(spec 005)_
  - [x] **Asset List with Live Sparklines:** Populate the watchlist/asset table with live prices, 24h changes, and mini trend sparklines. _(spec 006)_

---

### Phase 2 — Market State & Signals

_Give users the "why" behind the numbers — a durable record of market conditions, and signals derived from it._

- [x] **Market Snapshot Store**
  - [x] **Hourly Market State:** Persist one structured snapshot per asset per hour — indicators across four timeframes, derivatives positioning, ETF flows and sentiment — as the durable foundation every later feature reads from. _(spec 010)_
  - [x] **Forecast Persistence:** Store every generated forecast alongside the snapshot it was based on, with model, prompt version and cost. _(spec 010)_

- [x] **Signals From Market State**
  - [x] **Deterministic Signal Rules:** Real bullish/bearish/neutral signals derived from the hourly snapshot — RSI, funding, open interest, ETF flows, volume, MA compression, Fear & Greed — generated inside the collection run and persisted. 16 rules, 473 tests. _(spec 014)_

---

### Phase 3 — An Honest Product

_Before adding anything, remove everything the product claims but cannot do. This phase ships no new capability and is the highest priority in the project._

- [ ] **Stop Showing Unmeasured Numbers**
  - [ ] **Delete the Fabricated Models Data:** Remove the invented model roster and accuracy figures that the Models page renders as if measured. _(spec 011, Slice 1)_
  - [x] **Trim to the Forecasting Core:** Remove the Portfolio page, holdings panels and mocked holdings data, and rewrite the landing page so it describes only what the product does — no wallet connection, no pricing tiers, no invented traction statistics. _(spec 016)_

- [ ] **Trustworthy Collection**
  - [ ] **Prove the Pipeline Runs:** Verify hourly collection actually writes, expose true data freshness on every surface that displays it, and make a stalled pipeline visible rather than silent. _(spec 017)_
  - [ ] **Survive Neglect:** Weekly database dump, documented restore, and a scheduler that degrades to daily rather than to silence. _(spec 017)_

---

### Phase 4 — Signals That Explain, Not Just Flag

_Market state says what moved. News says why. This is the feature that makes the signals feed worth opening daily._

- [ ] **News Impact Signals**
  - [ ] **Classified News Impact:** Pull crypto news headlines and have an LLM classify each one for impact — direction, magnitude, horizon, and confidence — persisted into the same signals feed with its source link. _(spec 015)_
  - [ ] **Market-Wide vs Coin-Specific Scope:** Every classified item is tagged as affecting the whole crypto market or one specific tracked asset, so the feed can be filtered to the coin the user is looking at. _(spec 015)_
  - [ ] **Scoreable News Claims:** Each news signal stores an asserted direction and horizon, so it can be resolved against what actually happened rather than remaining an unfalsifiable opinion. _(spec 015)_

---

### Phase 5 — Keeping Score

_The product's core promise: forecasts that are measured, not asserted._

- [ ] **Deeper History**
  - [ ] **Market History Backfill:** Reconstruct the price-side snapshot history from exchange klines and the sentiment index, clearly labelled as backfilled and excluded from every calibration sample. Ships at daily resolution; whether finer resolution is needed is an open question resolved by evidence, not by argument — `decisions.md` §7.1. _(spec 013)_

- [ ] **Forecast Scoring & Models Explorer**
  - [ ] **Forecast Resolution:** Once a forecast's horizon elapses, fetch the real price and record which scenario actually happened. _(spec 011)_
  - [ ] **Calibration Metrics:** Score every resolved forecast with a multi-scenario Brier score and hit rate, grouped by model and prompt version. _(spec 011)_
  - [ ] **Models Explorer, Rebuilt:** A Models page showing only measured performance, with a regime breakdown that exposes systematic bias — and an explicit empty state below the minimum sample size. _(spec 011)_
  - [ ] **Signal Thresholds Made Measurable:** Use the scoring loop to replace the conventionally-chosen thresholds in the market-state rules with evidenced ones. Spec 011 ships the instrument, so this is now evidence-work, not design-work — spec 014's thresholds can be re-derived from resolved scores rather than kept by convention. _(spec 011, follow-on)_

---

### Phase 6 — Conditional & Optional

_Neither item is committed. The first is gated on evidence; the second is a nice-to-have that no other work depends on._

- [ ] **Historical Analogs** — _gated_
  - [ ] **Run the Falsification Test:** Execute the already-written analog falsification script on real history and read the verdict. This decides whether the feature is built at all. Spec 011's forecast-scoring loop now exists as the measuring instrument, so analog base rates can themselves be scored against outcomes — the feature is falsifiable in a way it was not when first proposed. _(spec 012, Gate)_
  - [ ] **Analog Base Rates:** If and only if the test shows signal with adequate power — surface "of N comparable setups, price rose in M" as measured base rates in the forecast context, and feed them into the forecast prompt. _(spec 012)_

- [ ] **Real-Time Chart Ticker** — _optional_
  - [ ] **Live Streaming Prices:** Stream live price updates for BTC, ETH and SOL directly on the main chart, reconnecting automatically on disconnect. _(spec 007)_

---

### Explicitly Not On This Roadmap

Removed by decision on 02.09.2026, not deferred: portfolio and holdings, wallet or
exchange connections, user accounts and any personal data, pricing tiers and billing,
social features, mobile app, trading execution or recommendations, and alerting. See
`product-definition.md` §3.2. Spec 016 deletes the code that implies these exist.

Also not on this roadmap: **news-headline signals as originally designed in spec 002**
(LLM classification with no persistence, no scope tagging and no scoreable claim). Spec
015 supersedes it.
