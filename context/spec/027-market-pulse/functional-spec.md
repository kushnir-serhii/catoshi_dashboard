# Functional Specification: Market Pulse & Signals Coverage

- **Roadmap Item:** Phase 4 — Signals That Explain, Not Just Flag → one-glance market summary
- **Status:** Completed
- **Author:** Serhii Kushnir
- **Created:** 2026-10-07
- **Builds on:** spec 014 (market-state rules), spec 015 (news classification)
- **Reverses, in one bounded way:** `product-definition.md` §3.2 "Alerting" (see §2.7)

> Numbering note: `README.md` §3 lists 025 with no folder in this checkout, and 026 is
> taken. This spec is 027.

---

## 0. Why now: the 2026-10-07 drop

On 2026-10-07 ETH fell from ~2,700 to 2,596 within an hour. The causes were all public
before or during the move:

| Driver | Was it on `/signals`? |
|---|---|
| ETH spot ETFs: 3+ consecutive outflow days, −$201.9M on 10-06 | **No.** `etf_streak` needs ≥ 5 days |
| ~$403M of long liquidations within one hour (CoinGlass) | **No.** Liquidations are not collected (repo-level `decisions.md` §8 #7) |
| Brent > $101 after tanker attacks, US 10Y at 5.3%, firmer dollar | **No.** No macro source exists |
| Fed minutes due the same day | **No.** No event calendar exists |
| ETH broke its 2-week range low; 1h RSI 23 | **No.** No range-break rule; the card cap hid ETH technicals |
| BTC: largest exchange outflow in 7 months (bullish counterweight) | **No.** No bullish on-chain input |
| Long/short ratio 3.27 | **Yes** — live since 2026-09-18. Correct, but alone |
| News: "Bitcoin dips below $84,000 as oil jumps on Iranian tanker attacks" | Yes, but tagged `LOW`, scope `BTC` — it was a market-wide macro shock |

Live `/api/signals` at 08:00Z showed **5 market-state cards** and a news list padded with
duplicates (each of SEC 3x funds, OKX/ICE, Solana/JPMorgan and Citi appeared twice) and
opinion columns tagged `BULLISH MEDIUM`. No `cointelegraph` item appeared at all, though
it is one of the three configured feeds.

Two problems, one spec:

1. **Coverage.** The feed misses the inputs that moved the market.
2. **Synthesis.** Even a complete feed of 30 cards does not answer the user's question:
   *is the market bearish, ranging or bullish right now, and why?*

---

## 1. Overview and Rationale (The "Why")

A user opening Signals wants one answer first and the evidence second. Today they get
only the evidence, incomplete and unsorted by consequence.

This spec adds a **Market Pulse** block at the top of Signals: a single bar from bears
(red) through range (yellow) to bulls (green), the 3–5 drivers that put it there, and the
next scheduled event that could move it. It also closes the coverage gaps in §0 and fixes
the classification defects that make the news half of the feed noisy.

It is **not a forecast.** It describes the balance of live evidence now. It makes no
price claim and no direction probability, and says so on the surface.

**Success:** on a day like 2026-10-07, a user opening Signals sees the bar deep in the red
or marked as conflicted, with "ETH ETF outflows", "oil / yields" and "long crowding"
named as drivers, *before* reading any individual card. The ETF and oil drivers cannot be
replayed for 10-07: ETF flows were not collected before 10-09 and the macro collector did not
exist then. The verifiable replay covers the derivatives drop at 02:00Z.

---

## 2. Functional Requirements (The "What")

### 2.1 — Market Pulse block

At the top of the Signals page, above all cards:

1. **The bar.** A horizontal scale from −100 to +100 with a three-zone gradient:
   red (bears, below −20), yellow (range, −20…+20), green (bulls, above +20).
   - A solid marker at the current value.
   - A hollow ghost marker at the value 24h ago, so the direction of travel is visible.
   - A text label beside the number: "Bearish", "Range", "Bullish".
2. **Two indices under one bar.** The bar shows `bull − bear`, where each index runs
   0–100. When **both** are ≥ `PULSE_CONFLICT_MIN` (default 50), the bar fill becomes
   striped and a **⚖️ Conflict** badge appears with the copy: "Strong signals point both
   ways. Direction is unreliable; expect wider swings." Without this, a quiet market and
   a market in a tug-of-war both render near zero and look identical.
3. **Scope switch:** Market · BTC · ETH · SOL. Default Market. Reuses the existing
   `scope` vocabulary from spec 015. The switch changes the Pulse only; the feed below is
   not filtered by it.
4. **Top drivers.** 3–5 chips, each with a sign colour, a short label and its number, for
   example `ETH ETF −$202M · 3d`, `Brent $101.6`, `Long/short 3.27`,
   `BTC exchange outflow 24k`. Ordered by absolute contribution. Clicking a chip scrolls
   to and highlights the underlying card in the feed below.
5. **One-line summary.** Built from a template over the top drivers (no LLM in v1), e.g.
   "Bearish: ETF outflows, rising oil and yields, crowded longs. Counterweight: BTC
   leaving exchanges."
6. **Next event.** The nearest scheduled macro event within 72h from the event calendar
   (§2.4), e.g. "Fed minutes · today 20:00". Hidden when none is within 72h.
7. **Freshness line.** "Updated 10:00 · from 23 live signals". The time is the
   computation's input time, never request time (README §4 rule 1), shown in the viewer's local time zone with its
   offset.
8. **Disclaimer:** "Balance of live signals. Weights are conventions, not calibrated
   (yet). Not a forecast. Not financial advice."

**Acceptance Criteria:**
- [x] The bar, label, ghost marker, drivers, summary, freshness line and disclaimer all render for each scope. _Verified 2026-10-09: production /signals rendered (docs/screenshots/027-market-pulse-desktop-1440-emulated.png, -mobile-375-emulated.png); ghost marker (`prev24h`) by pulse-api.test.ts, live only once a ±2h/24h-old row exists (first expected ~2026-10-10 11:00Z)._
- [x] The Conflict state renders when both indices are ≥ `PULSE_CONFLICT_MIN`, and only then. _Verified by pulse.test.ts (Conflict boundary, MEDIUM-vs-MEDIUM no Conflict); no live Conflict on 2026-10-09 (bull 41, bear 50)._
- [x] Clicking a driver chip scrolls to the card it came from. _Verified 2026-10-09 on production at 375px: click scrolled and highlighted `signal-3060`._
- [x] Readable at 375px with no horizontal scroll. Dark theme only. No text below 12px. _Verified 2026-10-09: scrollWidth 375 at 375px, min font 12px, see docs/screenshots/027-market-pulse-mobile-375-emulated.png._

### 2.2 — Pulse failure states (README §4 rule 1)

| Condition | What the block shows |
|---|---|
| Pulse query fails | "Market Pulse unavailable." No bar, no number |
| Newest pulse row older than `SIGNALS_FRESHNESS_HOURS` | The bar greyed out with "Stale: last computed <time>", using the last value this page already holds. A fresh page load holds none: text only, no bar |
| Fewer than `PULSE_MIN_INPUTS` live inputs for the scope | "Not enough live signals to summarise." No bar |
| A source category is down (e.g. macro collector failed) | Bar renders; a line names the missing category: "Without: macro" |

**Acceptance Criteria:**
- [x] No state renders a number the system did not compute from live inputs. _Verified by pulse-api.test.ts (stale/insufficient/unavailable carry no numbers) and Slice 5 route-interception run._
- [x] A missing category is named, never silently treated as neutral. _Verified on production: "Without: flows" shown (BTC:etfFlows collector null)._

### 2.3 — Market-state coverage (extends spec 014)

New or changed rules, each a pure function with the spec-014 null discipline:

| Rule | Fires when | Tag |
|---|---|---|
| `etf_streak` (changed) | Same-sign ETF net flow for ≥ 3 days (was 5), **or** a single day beyond ±$100M | By direction |
| `long_flush` (new) | OI falls ≥ `PULSE_OI_FLUSH_PCT` over 1h **and** price falls ≥ `PULSE_PRICE_FLUSH_PCT` | Bearish |
| `short_squeeze` (new) | Mirror of `long_flush`: OI falls while price rises | Bullish |
| `price_velocity` (new) | 1h return beyond ±3% | By direction |
| `range_break` (new) | The last closed 4h candle closes below the lowest low, or above the highest high, of the 14 days of closed 4h candles before it, by a buffer (`RANGE_BREAK_BUFFER_PCT`) | By direction |
| `rsi_1h_extreme` (new) | 1h RSI ≤ 25 or ≥ 75 | Contrarian, `LOW` severity: ≤ 25 is Bullish (oversold), ≥ 75 is Bearish (overbought) |

`long_flush` / `short_squeeze` are a **proxy** for liquidations. True liquidation data
stays out of scope (repo-level `decisions.md` §8 #7).

**Card cap.** `SIGNALS_COUNT = 6` hides most live market-state signals. The feed shows
**all** live signals, grouped by scope, with the top 6 expanded and the rest collapsed
under "Show N more".

**Acceptance Criteria:**
- [x] Replaying the 2026-10-07 02:00Z ETH snapshot (the drop hour) fires `long_flush` or `price_velocity` (bearish, ETH). `etf_streak` (bearish, ETH) fires on the same snapshot with the ETF fields that were public that day (−$201.9M on 10-06, 3+ outflow days) injected, because ETF flows were not stored before 2026-10-09. _Verified by signals-coverage.test.ts (2026-10-07 replay: `etf_streak` and `long_flush`/`price_velocity` fire for ETH)._
- [x] Every live market-state signal is reachable on the page; none is dropped by the cap. _Verified 2026-10-09: /api/signals returns all 3 live rows, all 3 rendered on /signals._

### 2.4 — New inputs

| Input | Source | Cadence | Signal |
|---|---|---|---|
| Brent crude, US 10Y yield, broad dollar index | FRED (`DCOILBRENTEU`, `DGS10`, `DTWEXBGS`) | Daily for 10Y; Brent and dollar arrive in weekly batches (below) | Macro rules: Brent day change ≥ ±3%; 10Y ≥ ±8 bp/day; dollar ≥ ±0.5%/day. Direction for crypto: rising = bearish |
| Event calendar | `src/data/macro-calendar.json`, maintained by hand | — | Not a signal; feeds §2.1 item 6 |

Cadence checked on FRED on 2026-10-09: `DGS10` posts daily with about one business day of
lag. `DCOILBRENTEU` (EIA) and `DTWEXBGS` (Fed H.10) are daily series **released in weekly
batches**: Brent's last release carried data to 10-06 (posted 10-07, next release 10-15),
the dollar index data to 10-02 (posted 10-05, next release 10-13). So the macro rules cannot
catch a shock as it happens. On the morning of 2026-10-07 Brent's move was not on FRED yet;
the oil driver in §0 comes from the market-scope news item, not from this collector. Macro
sets the backdrop; the hourly derivatives rules and market-scope news catch the shock. Each
macro card states its observation date ("as of 10-06") and ages out per series (technical
§4.2).

**Acceptance Criteria:**
- [x] A FRED outage nulls the macro rules only. Everything else keeps working. _Verified by signals-coverage.test.ts and Slice 3 local collect (macro null, other sources ok); production macro status success, rows=59._
- [x] Macro signals carry scope `market`. _Verified by signals-coverage.test.ts; no macro signal live on 2026-10-09 (no threshold crossed)._
- [x] **FRED attribution (FRED API Terms of Use, https://fred.stlouisfed.org/docs/api/terms_of_use.html; required because the app may become commercial):**
  - Every page footer shows: "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis." followed by a "FRED API Terms of Use" link (new tab, `rel="noopener noreferrer"`), at least 12px and readable at 375px.
  - Every macro card shows "Source: FRED, as of <obs date>".
  - No FRB logo, and no "FRED" or "Federal Reserve" in any name, hostname or branding.
  - If a Terms of Service page is ever added, it states that users are also bound by the FRED API Terms of Use.
  - Before going commercial, confirm that the notes of `DCOILBRENTEU`, `DGS10` and `DTWEXBGS` on fred.stlouisfed.org contain no copyright restriction (open item, see decisions.md).

### 2.5 — News quality (extends spec 015; bumps `NEWS_PROMPT_VERSION`)

1. **Macro shocks are market-wide.** War, oil, rates, sanctions, tariffs → scope
   `market`, magnitude at least `MEDIUM`.
2. **Event vs opinion.** Each classification gets `content_type`: `event` (something
   happened or was decided) or `opinion` (columns, previews, price-target talk,
   "X in play"). Opinion items stay in the feed with an "Opinion" badge and weigh
   `PULSE_OPINION_WEIGHT` (default 0) in the Pulse.
3. **Duplicates merge.** Items about the same event within 24h render as one card with
   every source listed. The Pulse counts the event once.
4. **Horizon caps by magnitude.** `LOW` ≤ 72h, `MEDIUM` ≤ 336h, `HIGH` ≤ 720h. Expired items
   never enter the Pulse.
5. **The missing feed.** Find out why `cointelegraph` produces zero rows and fix it, or
   record it as dead in source status. It must not fail silently.

**Acceptance Criteria:**
- [x] Re-classifying the 2026-10-07 tanker headline yields scope `market`, magnitude ≥ `MEDIUM`. _Verified in Slice 1 on live data (decisions.md) and news-classify tests._
- [x] The duplicate pairs listed in §0 render as one card each. _Verified in Slice 1 (decisions.md) and news-cluster/news-collapse tests._
- [x] "Bitcoin beats gold, surge to $100,000 in play" is `opinion`. _Verified in Slice 1 (decisions.md)._
- [x] Source status shows all three feeds with a real last-success time. _Verified 2026-10-09: /api/health lists news:coindesk, news:cointelegraph, news:decrypt, all success._

### 2.6 — Pulse history

The Pulse is computed once per collection run, per scope, and stored. The ghost marker
reads it. A 7-day sparkline of the value under the bar is optional in this spec.

### 2.7 — Telegram notifications (bounded reversal of "no alerting")

`product-definition.md` §3.2 rules out alerting. This spec reverses that for **one
recipient only: the operator**, via a Telegram bot whose token and chat id live in env
vars. It sends nothing to visitors, collects no user data, and keeps the §3.3 boundary
test intact.

| Type | Fires when |
|---|---|
| 🔴 Bearish confluence | ≥ `PULSE_ALERT_MIN_CATEGORIES` (default 4) distinct bearish categories live and bear index ≥ 60 |
| 🟢 Bullish confluence | Mirror |
| ⚖️ Conflict | Enters the Conflict state |
| 🔄 Reversal | Pulse value moves ≥ 40 points within 24h |

- At most one message per type per scope per 24h.
- Each message carries the bar value, the drivers and a link to `/signals`.
- **Gated by §2.8.** Not enabled before the backtest verdict.

### 2.8 — GATE: backtest before notifications

Replay the Pulse over every live-collected snapshot (not backfilled ones: derivatives
history does not backfill, spec 010 §1) and measure, per scope:

- how often a bearish-confluence alert was followed, within 72h, by a 1h close ≥ 5% below
  the alert hour's close (a hit), and how often it was not (false alarms);
- the same for bullish confluence and closes ≥ 5% above;
- the base rate in the same direction: the share of all hours followed by such a move (not
  a direction-agnostic ≥ 5% move);
- the price series is the scope's own; `market` uses BTC;
- n counts alerts after the 24h dedupe, and only alerts at least 72h apart, so outcome
  windows do not overlap.

| Verdict | Condition | What ships |
|---|---|---|
| **A** | ≥ 10 qualifying alerts per type, and hit rate beats the same-direction base rate (one-sided binomial p < 0.10) | Notifications on |
| **B** | Fewer than 10 qualifying alerts (too little history) | Notifications on, every message labelled "Unvalidated (backtest n = <n>)". Re-run monthly |
| **C** | ≥ 10 qualifying alerts and not better than base rate (p ≥ 0.10) | Notifications off. Keep the UI. Revisit weights |

News signals have only a few weeks of history; the replay uses what exists and reports
the market-state-only result separately. Live derivatives history starts 2026-09-18, about
three weeks at spec time, so **Verdict B is the expected first result**. That is acceptable
and is what B is for.

**Acceptance Criteria:**
- [x] The verdict and its numbers are recorded in this section before notifications are enabled.

**Result 2026-10-09: Verdict B** (too little history). Run on 2026-10-09 with `npm run pulse-backtest` (local, read-only, .env.local Neon DB). Data window 2026-09-01 16:00Z to 2026-10-09 12:00Z (all live-collected history; 1530 snapshots, 0 backfilled). 510 hours replayed, 438 scored per scope (72 censored by the 72h window). Pulse points ok / insufficient: market 314/196, BTC 6/504, ETH 17/493, SOL 8/502.

Full replay (market-state + macro + news), confluence cells (primary, set the verdict). No alert survived the 24h dedupe and 72h spacing in any cell, so every hit rate and p-value is undefined:

| Scope | Type | n | Hits | Same-direction base rate | p | Verdict |
|---|---|---|---|---|---|---|
| market | bear_confluence | 0 | 0 | 4.8% | n/a | B |
| market | bull_confluence | 0 | 0 | 16.2% | n/a | B |
| BTC | bear_confluence | 0 | 0 | 4.8% | n/a | B |
| BTC | bull_confluence | 0 | 0 | 16.2% | n/a | B |
| ETH | bear_confluence | 0 | 0 | 10.7% | n/a | B |
| ETH | bull_confluence | 0 | 0 | 13.2% | n/a | B |
| SOL | bear_confluence | 0 | 0 | 10.7% | n/a | B |
| SOL | bull_confluence | 0 | 0 | 27.2% | n/a | B |

- Market-state only (news excluded, macro kept): Verdict B, n = 0 in all 8 confluence cells (points ok / insufficient: market 311/199, BTC 0/510, ETH 11/499, SOL 2/508).
- Informational, not part of the verdict: conflict n = 0 and reversal n = 0 in all four scopes, in both variants.
- News contributed ~0 in this run: past hours only had news-v1 classifications (no content_type), which the Pulse excludes, so this verdict covers market-state + macro only. Mean news rows per hour was 75.9 but only 0.9 had a content type (6 hours with any counting news row). Macro readings were empty (0 rows, no FRED key yet).
- Conventions: current rules replayed over past hours; prices are the live-collected `snapshots.price` and `range_break` uses spot 4h candles from Binance (live collector reads USDT-M perp, small basis difference); the overall verdict is the worst confluence cell; conflict and reversal are informational. Full report: `.cache/pulse-backtest/out/pulse-backtest-report.md` (not committed).
- Next step: Verdict B, so Slice 7 ships with `PULSE_NOTIFY_VERDICT=B`, every message labelled "Unvalidated (backtest n = 0)". Re-run the backtest monthly.

---

## 3. Scope and Boundaries

### In-Scope
- Market Pulse block, pulse computation and history.
- Rule changes and new rules in §2.3; macro collector and event calendar in §2.4.
- News classification fixes in §2.5.
- Operator-only Telegram notifications behind the §2.8 gate.

### Out-of-Scope
- Liquidation data, and any always-on process (WebSocket, sub-hourly polling). The
  operator has stated he would not react faster than hourly anyway.
- Exchange on-chain flows as a collected input (no reliable free source found). The BTC
  outflow in §0 stays a news-sourced item.
- LLM-written summary text. Template only in v1.
- Notifications to anyone except the operator; email; push.
- Calibrated weights. That is spec 011 follow-on work; until then the surface says so.
- Assets beyond BTC/ETH/SOL.
