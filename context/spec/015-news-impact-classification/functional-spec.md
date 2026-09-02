# Functional Specification: News Impact Classification

- **Roadmap Item:** Phase 4 → Signals That Explain, Not Just Flag → **News Impact Signals**
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Spec 014 gave the Signals feed a real spine: sixteen deterministic rules over the hourly
market-state snapshot, each traceable to a measured number. It answers **what the market is
doing**. It cannot answer **why**, and it never will — no arrangement of RSI, funding and
ETF flows contains the sentence "the SEC proposed an exemption" or "a strike closed the
Strait of Hormuz".

The manual forecast log makes the cost of that gap concrete. Two of the last three forecasts
were directionally right for the wrong reason, and the largest single move in the record —
the one that produced the project's founding lesson — was driven by a macro-liquidity event
and a political trigger that were invisible on the chart. The log's own conclusion was to add
a geopolitics line to the pre-forecast checklist. That checklist is what this pipeline exists
to automate.

Spec 002 originally proposed news signals and was never built. Its design was also wrong in a
way worth stating, because it is tempting to rebuild: it classified headlines into
bullish/bearish and displayed them, with **no persistence, no scope, and no falsifiable
claim**. A feed of unfalsifiable opinions rendered as data is the same defect as the Models
page (`decisions.md` §3), just wearing a more respectable hat.

This spec builds news signals that are **scoped** and **scoreable**:

- **Scoped** — every item says whether it moves the whole crypto market or one specific
  tracked asset, so the feed can be filtered to the coin the user is looking at.
- **Scoreable** — every item stores an asserted direction and a horizon, so spec 011's
  machinery can eventually grade news classification the same way it grades forecasts.

**Success looks like:** a user opens Signals during a market move, sees a market-wide bearish
item — *"US CPI print above consensus · market-wide · bearish · 7d · high confidence"* — with
the headline, the source, a link to the original article, and its true age. And six weeks
later, the Models page can say how often those calls were right.

---

## 2. Functional Requirements (The "What")

### 2.1 Headlines are ingested with enough fidelity to classify

- **As the** system, **I need** each article's title, URL, source and publication time,
  **so that** an item can be de-duplicated, linked and aged.
  - **Acceptance Criteria:**
    - [ ] Each ingested article stores: title, canonical URL, source name, published-at
          timestamp, and the feed it came from.
    - [ ] An article already ingested is never re-ingested or re-classified, identified by a
          hash of its canonical URL.
    - [ ] Articles older than the configured ingest window are discarded at ingest, not
          classified.
    - [ ] **A feed that fails returns nothing.** It must never contribute a placeholder string
          such as `"News fetch failed"` into any downstream consumer.

### 2.2 Each article is classified for impact

- **As a** user, **I want** to know how a headline is likely to matter, **so that** I can tell
  a real catalyst from routine coverage.
  - **Acceptance Criteria:**
    - [ ] Each classified item carries: **scope**, **direction**, **magnitude**, **horizon**,
          **confidence**, and a one-sentence rationale.
    - [ ] **Scope** is either `market` (affects crypto broadly) or a single tracked asset
          symbol (`BTC`, `ETH`, `SOL`).
    - [ ] **Direction** is `BULLISH`, `BEARISH` or `NEUTRAL`, matching the existing signal tag
          vocabulary.
    - [ ] **Magnitude** is an ordered band — `LOW`, `MEDIUM`, `HIGH` — describing expected
          impact size, not certainty.
    - [ ] **Horizon** is the period over which the impact is asserted, in hours.
    - [ ] **Confidence** is the classifier's own certainty, held separately from magnitude.
    - [ ] An article naming an asset the system does not track is classified as `market` if it
          has broad relevance, and otherwise **dropped**. It is never coerced onto a tracked
          asset.
    - [ ] `NEUTRAL` is a real answer and must be reachable. A classifier that never returns it
          is miscalibrated and the prompt is wrong.

### 2.3 Classified items appear in the existing Signals feed

- **As a** user, **I want** news and market-state signals in one stream, **so that** I do not
  have to check two places.
  - **Acceptance Criteria:**
    - [ ] News items appear in the same feed as spec 014 signals, visually distinguished as
          news, showing source name and a link to the original article.
    - [ ] The feed can be filtered to `market` scope or to a single asset.
    - [ ] A news item's displayed age is the **article's publication time**, never the
          classification time and never the render time.
    - [ ] News items expire: past their horizon they leave the live feed. An expired item is
          retained in the database for scoring, not shown as live.
    - [ ] Market-state signals are unaffected in content, ordering logic or freshness
          behaviour by this spec.

### 2.4 Every claim is falsifiable

- **As the** maintainer, **I want** each news signal to make a checkable claim, **so that** the
  feature can be graded rather than believed.
  - **Acceptance Criteria:**
    - [ ] Each item stores its asserted direction, horizon and scope in a form the resolution
          job can evaluate against realised price movement.
    - [ ] Each item stores the `prompt_version` that produced it. A prompt change bumps it.
    - [ ] Each item stores the model id and the token/cost figures for the call.
    - [ ] Scoring news items is **out of scope for this spec** — it is spec 011 follow-on work.
          This spec's obligation is to store everything that scoring will need.

### 2.5 A dead classifier is visible, not disguised

- **Acceptance Criteria:**
  - [ ] If classification fails, **no row is written** — no neutral row, no placeholder, no
        cached previous answer re-dated.
  - [ ] The failure is recorded in the collection run's source status alongside the existing
        collectors.
  - [ ] The Signals page shows the true age of the newest news item. If the newest is three
        days old, it says so.
  - [ ] A classification failure never fails the collection run or blocks market-state signal
        generation.

### 2.6 Cost stays inside the plan

- **Acceptance Criteria:**
  - [ ] Classification runs on the cheap model tier, in batches, at a configured cadence — not
        once per article and not every collection run.
  - [ ] A hard per-run cap on articles classified. Exceeding it defers the remainder to the
        next run rather than spending unbounded tokens.
  - [ ] The steady-state cost is verified against the ~$1/month allowance in
        `analytics-plan.md` §4 and recorded.
  - [ ] Every classification call's cost is persisted, so the figure is measured rather than
        estimated.

---

## 3. Scope and Boundaries

### In-Scope

- Ingesting articles from the RSS feeds already configured in `src/lib/marketData.ts`
  (CoinDesk, Cointelegraph, Decrypt), with URL, source and publication time.
- Persisting raw articles and de-duplicating them.
- Batch LLM classification into scope / direction / magnitude / horizon / confidence /
  rationale, via structured tool-use output.
- Persisting classified items into the signals feed with source attribution and expiry.
- Filtering the feed by scope.
- Recording `prompt_version`, model and cost per classification.

### Out-of-Scope

- **Scoring news signals.** The data is stored for it; the resolution logic is spec 011
  follow-on work.
- Adding new feeds beyond the three configured. A fourth feed is a one-line change once the
  ingest path exists, and is not this spec's risk.
- Reddit or social sentiment classification. The Reddit fetch stays as forecast-prompt input
  only.
- Article body extraction or full-text fetching. Titles and metadata only — body scraping
  brings paywalls, licensing and parsing cost for unproven marginal value.
- Translating or summarising articles.
- Push, email or any alerting on a news signal.
- Injecting classified news into the forecast prompt. Reasonable, but a separate change with
  its own effect on forecast scores; it must not be bundled with the ingest work, or the
  score series becomes uninterpretable.
- Any user-configurable feed list, since there are no user accounts.
