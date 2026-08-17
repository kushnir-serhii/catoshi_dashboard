# Functional Specification: AI / Market Signals Feed

- **Roadmap Item:** Phase 2 — AI / Market Signals Feed: Live Signals from News Sources
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Crypto investors currently rely on separate news sites to understand the "why" behind price movements. They must manually sift through headlines, filter noise, and decide whether an article is bullish or bearish for their assets — a time-consuming process that defeats the purpose of a unified dashboard.

The Signals feature brings classified, curated market intelligence directly into Catoshi. Instead of opening news tabs, the user sees a compact, pre-classified feed of the 6 most relevant signals on the Signals page — each labelled **Bullish**, **Bearish**, or **Neutral**, with a plain-language headline, a one-sentence summary, the source, and the coins it relates to. The feed refreshes automatically every 6 hours, so it's always near-current without any user action.

**Success looks like:** The user opens the Signals page and within seconds understands the current market sentiment — no reading required.

---

## 2. Functional Requirements (The "What")

### 2.1 The Signals Feed

The Signals page displays exactly **6 signal cards** drawn from the latest crypto news. Each card shows:

- A **sentiment label** — one of: **Bullish**, **Bearish**, or **Neutral** — visually distinct for each type (e.g. by color).
- A **short headline** — a plain-language summary of the news event (up to 8 words).
- A **one-sentence body** — a brief explanation of why it matters (up to 20 words).
- The **source** — the domain name of the publication (e.g. `coindesk.com`).
- The **publication time** — when the original article was published.
- **Coin chips** — small badge(s) next to the headline showing relevant asset tickers. Only assets from the tracked list are shown: **BTC, ETH, SOL, LINK, ARB, TAO**. If the signal is not specific to any tracked asset, no chips are shown.

**Acceptance Criteria:**
- [x] The Signals page always shows exactly 6 signal cards when data is available.
- [x] Each card displays: sentiment label, headline, body, source domain, publication time, and coin chips (if applicable).
- [x] The sentiment label is visually distinct for each type: Bullish, Bearish, Neutral.
- [x] Coin chips display only tickers from: BTC, ETH, SOL, LINK, ARB, TAO.
- [x] A signal not related to any tracked coin shows no coin chips.

---

### 2.2 Update Timestamps

Visible on the Signals page (above or below the cards), the user sees two timestamps:

- **"Last updated"** — the time the current batch of signals was fetched and classified.
- **"Next update"** — the scheduled time of the next automatic refresh (exactly 6 hours after "Last updated").

Both timestamps are displayed in the **user's local time and timezone** (based on their browser settings).

**Acceptance Criteria:**
- [x] A "Last updated" timestamp is visible on the Signals page, reflecting when the current signals were fetched.
- [x] A "Next update" timestamp is visible, showing exactly 6 hours after "Last updated."
- [x] Both timestamps are shown in the user's local time and timezone.

---

### 2.3 Automatic Refresh

The signals feed refreshes automatically every 6 hours in the background. The user does not need to take any action, and there is no manual refresh control on the page.

**Acceptance Criteria:**
- [x] Signals update approximately every 6 hours without any user action.
- [x] No manual refresh button or control is present on the Signals page.

---

### 2.4 Loading State (First Load)

When a user opens the Signals page before any signals have ever been fetched (e.g. on very first use), the page shows **6 skeleton placeholder cards** — animated placeholders in place of real signals — to indicate that content is on its way.

**Acceptance Criteria:**
- [x] On first use (no data available yet), the Signals page shows 6 skeleton/placeholder cards.
- [x] Skeleton cards do not display any text, sentiment labels, or coin chips.

---

### 2.5 Stale Data Warning

If the most recent automatic fetch fails for any reason (e.g. the news provider is unreachable), the page **continues showing the most recently fetched signals** and displays a **small warning banner** above them, informing the user that the data may be outdated. The signals remain fully readable.

**Acceptance Criteria:**
- [x] When a fetch fails, the previously fetched signals remain visible and readable.
- [x] A visible warning banner appears above the signals, indicating the data may be outdated.
- [x] The warning banner does not hide, replace, or overlap the signal cards.
- [x] The "Last updated" timestamp reflects the last *successful* fetch, not the failed attempt.

---

## 3. Scope and Boundaries

### In-Scope

- Signals page displaying exactly 6 classified signal cards.
- Sentiment labels (Bullish, Bearish, Neutral) per signal.
- Short headlines and one-sentence summaries in plain language.
- Coin chips for tracked assets: BTC, ETH, SOL, LINK, ARB, TAO.
- Source domain and publication timestamp per signal.
- "Last updated" and "Next update" timestamps in the user's local time.
- Automatic 6-hour refresh cycle.
- Skeleton loading state for first-time load (no data yet).
- Stale data warning banner when a fetch fails.

### Out-of-Scope

- Manual refresh triggered by the user.
- Filtering or sorting signals by coin, sentiment, or date.
- Clicking through to the original news article.
- Push or browser notifications for new signals.
- Signals for coins outside the tracked list.
- User customization of which coins to track or how many signals to show.
- More or fewer than 6 signals at a time.

The following are addressed in separate specifications:
- Historical Price Chart (Phase 1)
- Asset List with Live Sparklines (Phase 1)
- Live Price Ticker (Phase 2)
- Portfolio Overview & P&L (Phase 3)
- Projections & Models (Phase 3)
