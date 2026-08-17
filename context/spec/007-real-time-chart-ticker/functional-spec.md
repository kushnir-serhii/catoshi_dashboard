# Functional Specification: Real-Time Chart Ticker

- **Roadmap Item:** Phase 2 — Live Price Ticker > Real-Time Chart Ticker
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

The historical price chart shows where an asset has been, but not where it is right now. The most recent price on the chart is always slightly behind, updated only once per minute. For a user making a decision in the moment, this lag is noticeable.

This feature adds a live price label pinned to the right edge of the chart at the exact current price level. The label updates continuously as new prices stream in, giving the user an immediate, live read of the market alongside the historical picture.

**Success looks like:** A user opens the Markets page, sees the BTC chart, and notices a live price label on the right edge ticking green on upticks and red on downticks. They switch the chart to ETH and the label seamlessly updates to ETH's live price.

---

## 2. Functional Requirements (The "What")

### 2.1 Live Price Label on the Chart

A price label is pinned to the right edge of the price chart, positioned at the current live price level. It shows the asset's current price in USD and updates continuously with each new price received.

**Acceptance Criteria:**
- [ ] A price label appears on the right edge of the chart at the current price level for BTC, ETH, and SOL.
- [ ] The label updates continuously as new prices arrive — not on a 60-second cycle.
- [ ] When the user switches the chart to a different asset (e.g. BTC → ETH), the label switches to stream that asset's live price.
- [ ] When the selected asset is not BTC, ETH, or SOL, no live label is shown.

---

### 2.2 Directional Flash on Each Tick

Each time a new price arrives, the label briefly changes colour to signal direction — green if the price went up, red if it went down — then returns to its neutral colour after a short moment.

**Acceptance Criteria:**
- [ ] When a new price is higher than the previous, the label flashes green briefly, then returns to neutral.
- [ ] When a new price is lower than the previous, the label flashes red briefly, then returns to neutral.
- [ ] The flash is short (under 1 second) and does not linger.

---

### 2.3 Connection Loss and Reconnect

If the connection to the live price stream is lost, the label remains visible showing the last known price and a subtle "Reconnecting…" indicator appears nearby. Once the connection is restored, the indicator disappears and live updates resume automatically — no user action required.

**Acceptance Criteria:**
- [ ] When the stream disconnects, the last known price remains visible on the label.
- [ ] A subtle "Reconnecting…" indicator appears near the label when the connection is lost.
- [ ] When the connection is restored, the "Reconnecting…" indicator disappears and price updates resume.
- [ ] Reconnection is fully automatic.

---

## 3. Scope and Boundaries

### In-Scope

- A live price label pinned to the right edge of the price chart for BTC, ETH, and SOL.
- Continuous price updates (not 60-second polling).
- Per-tick directional colour flash (green/red), returning to neutral after each flash.
- Automatic reconnection with a "Reconnecting…" indicator on connection loss.
- The label tracks whichever of the three supported assets is currently selected in the chart dropdown.

### Out-of-Scope

- **Portfolio Overview** — Real holdings, P&L, and allocation breakdown are a separate roadmap item.
- **Models Explorer** — AI model accuracy and confidence scores are a separate roadmap item.
- **Assets beyond BTC, ETH, and SOL** — The live stream covers only these three; other chart assets show historical data only with no live label.
- **Mobile app** — Web-only per the overall product scope.
