# Functional Specification: Forecasting-Core Scope Trim

- **Roadmap Item:** Phase 3 → An Honest Product → **Trim to the Forecasting Core**
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Catoshi's scope was narrowed on 02.09.2026 to **forecasting and signals**. Portfolio,
holdings, wallet connection, exchange keys, accounts and billing are not deferred — they
are removed by decision (`product-definition.md` §3.2).

Right now the product claims all of them. The dashboard ships a Portfolio page rendering
`src/data/portfolio.ts`, a hardcoded holdings table with an invented `$248,392` position.
The landing page goes further and sells them: "Link exchanges via read-only API or paste
wallet addresses. Keys never leave the secure enclave", three pricing tiers with a 14-day
trial and a "Talk to sales" CTA, "Holdings analytics: cost basis, P&L per lot, allocation
drift and tax-lot tracking", and a statistics band reading "Predictions / day: 1,248",
"Hit rate · 90d: 74.0%", "AUM under projection: $2.4B across 14k portfolios".

None of it exists. The hit rate is the exact figure the product has no right to state until
spec 011 measures one, and the security claim about a "secure enclave" is the most damaging
line on the page: it describes a control protecting data the product never receives.

This is the third instance of the project's recurring failure — a product that lies about
itself (`decisions.md` §3) — and the only one still visible to a first-time visitor.

**Success looks like:** every claim on the landing page and every page in the dashboard
corresponds to something the code actually does, and a visitor cannot form a false belief
about what Catoshi is or what it will ask of them.

This spec ships **no new capability**. It is subtraction, and it is Phase 3 because
everything built on top of a dishonest surface inherits the dishonesty.

---

## 2. Functional Requirements (The "What")

### 2.1 The Portfolio page is gone

- **As a** visitor, **I want** the navigation to offer only what exists, **so that** I do not
  click into a page of invented holdings.
  - **Acceptance Criteria:**
    - [ ] `/portfolio` returns the application's 404 page, not an empty shell.
    - [ ] "Portfolio" no longer appears in the sidebar or any navigation surface.
    - [ ] No holdings figure, cost basis, P&L or allocation percentage appears anywhere in
          the running application.
    - [ ] The default landing route for the dashboard remains `/projections`.

### 2.2 The landing page describes only what the product does

- **As a** first-time visitor, **I want** the marketing copy to match the product, **so that**
  I can decide whether it is useful to me without being misled.
  - **Acceptance Criteria:**
    - [ ] No feature card, step, or headline mentions wallets, exchange connection, API keys,
          holdings, cost basis, P&L, tax lots, rebalancing, or a "secure enclave".
    - [ ] The pricing section is removed entirely — no tiers, no prices, no trial, no
          "Talk to sales".
    - [ ] The statistics band contains **no invented figure**. Either it is removed, or every
          number in it is read from a real source. Until spec 011 has resolved forecasts,
          "hit rate" is not displayable at all.
    - [ ] The model description no longer names an ensemble of five models. The product runs
          **one** LLM call through a provider abstraction, and the copy says so.
    - [ ] Every forecasting claim on the page carries a visible non-financial-advice note.
    - [ ] No call-to-action implies account creation, sign-up, or payment.

### 2.3 Nothing personal is requested or implied

- **As a** privacy-conscious visitor, **I want** to see that the product asks nothing of me,
  **so that** I can use it without an account.
  - **Acceptance Criteria:**
    - [ ] No sign-up, login, email-capture or "connect" control exists in the UI.
    - [ ] The logout icon and any auth affordance are removed from the header/navigation.
    - [ ] The product-definition boundary test is stated somewhere a user can read it: Catoshi
          never asks who you are or what you own.

### 2.4 The removal is complete, not hidden

- **As the** maintainer, **I want** the code deleted rather than commented out or feature-
  flagged, **so that** it cannot silently return.
  - **Acceptance Criteria:**
    - [ ] The portfolio route, page component, panel components, mock data file and their
          exports are deleted from the repository.
    - [ ] No dead export, unused type or orphaned import remains — `npx tsc --noEmit` and
          `npm run lint` are clean.
    - [ ] `CLAUDE.md` and `context/product/architecture.md` no longer describe a portfolio
          surface.
    - [ ] The production build succeeds and produces no route for the removed page.

### 2.5 Dead constants are cleared while we are here

- **Acceptance Criteria:**
  - [ ] `SIGNALS_REVALIDATE_SECONDS` is removed from `src/consts/signals.ts` if, as expected,
        nothing reads it since spec 014 dropped `revalidate` from the route
        (`decisions.md` §8, defect 2). If something does read it, leave it and record why.

---

## 3. Scope and Boundaries

### In-Scope

- Deleting the Portfolio route, page, panels, mock data and navigation entry.
- Rewriting the landing page copy, feature list, steps, statistics band and CTAs; deleting
  the pricing section.
- Removing auth affordances that imply an account.
- Removing the now-dead exports, types and constants that fall out of the above.
- Updating `CLAUDE.md` and `architecture.md` to match.

### Out-of-Scope

- **Deleting `src/data/models.ts`** — that is spec 011, Slice 1. The two are separately
  shippable and should stay that way; do not merge them.
- Visual redesign of the landing page. This is a copy and section change, not a restyle.
- Any change to Projections, Markets or Signals behaviour.
- Removing the Models page. It stays and becomes truthful in spec 011.
- Building the news signals feature (spec 015).
- Anything requiring the database.
