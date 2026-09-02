# Technical Specification: Forecasting-Core Scope Trim

- **Functional Specification:** `./functional-spec.md`
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Pure deletion plus a copy rewrite. No database, no new dependency, no API change. The work
is entirely inside `src/app/(admin)/`, `src/components/`, `src/data/` and `src/consts/`.

The only real risk is an incomplete removal that leaves the codebase compiling but the app
half-honest, so the ordering below deletes leaves before trunks and finishes with a
compile-and-grep sweep.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Files to delete outright

| Path | Why |
|---|---|
| `src/app/(admin)/portfolio/page.tsx` | the route |
| `src/components/pages/PortfolioPage.tsx` | the page |
| `src/components/panels/HoldingsPanel.tsx` | holdings summary panel |
| `src/data/portfolio.ts` | the invented holdings (`$248,392`) |

### 2.2 Files to edit

| Path | Change |
|---|---|
| `src/consts/nav.ts` | drop the `portfolio` entry from `NAV_ITEMS` |
| `src/components/pages/index.ts` | drop the `PortfolioPage` export |
| `src/components/panels/index.ts` | drop the `HoldingsPanel` export |
| `src/components/dashboard/charts.tsx` | remove `HoldingsDonut` and any type it alone needs |
| `src/data/types.ts` | remove `Holding` / portfolio-only interfaces once nothing imports them |
| `src/components/layout/Header.tsx` | remove the logout affordance |
| `src/assets/icons/nav/log-out.svg` | delete if nothing else references it |
| `src/consts/signals.ts` | remove `SIGNALS_REVALIDATE_SECONDS` if unreferenced |
| `src/app/styles/landing.css` | remove rules for deleted landing sections |
| `src/app/styles/dashboard.css` | remove rules for the holdings donut/panel |
| `CLAUDE.md` | remove `portfolio/` from the route list and any holdings mention |
| `context/product/architecture.md` | already revised; re-check after the edit |

`ChartPanel`, `KPIs`, `WatchlistPanel` and `SignalsPanel` **stay** — they render market data,
not personal data.

### 2.3 Landing page rewrite (`src/components/landing/LandingPage.tsx`)

The component holds its content in four literal arrays plus JSX sections. Treat each as a
separate decision:

- **`stats`** — currently `Models in ensemble: 5`, `Predictions / day: 1,248`,
  `Hit rate · 90d: 74.0%`, `AUM under projection: $2.4B across 14k portfolios`. **Delete the
  array and the section.** A statistics band is only permissible once spec 011 serves real
  aggregates from `/api/models`; at that point it may return, reading live values with an
  explicit empty state. Do not replace the numbers with smaller invented ones.
- **`plans`** — the three pricing tiers. **Delete the array and the `#pricing` section**,
  along with the nav anchor that points at it.
- **`steps`** — "Connect / Project / Act", built around linking a wallet and setting rebalance
  alerts. **Rewrite** to describe what actually happens: the collector snapshots market state
  hourly, the model produces scenarios from that snapshot, the scoring loop grades them.
- **`features`** — remove cards 01 (portfolio projection from live holdings) and 05 (holdings
  analytics); rewrite 02 to describe one provider-abstracted LLM call rather than a
  five-model ensemble; keep 03 and 04 with copy corrected to the shipped behaviour.
- **Hero** — the headline, the "your portfolio into bull / base / bear scenarios" line, the
  "Read-only wallet access" badge and the closing "Connect your first wallet in 60 seconds"
  CTA all go. The CTA becomes a link into the dashboard.
- **`FaqSection.tsx`** — audit for the same claims; it was written against the old scope.

**Copy rule for this rewrite:** every sentence must be checkable against a file in `src/`. If
you cannot name the file that makes a sentence true, the sentence is not shipped.

### 2.4 Route removal

Deleting `src/app/(admin)/portfolio/page.tsx` is sufficient — App Router derives routes from
the filesystem, so `/portfolio` then falls through to `src/app/not-found.tsx`. No redirect is
added: a redirect would preserve the idea that the page moved somewhere.

`src/app/(admin)/page.tsx` already redirects to `/projections`; confirm it does not reference
the removed route.

---

## 3. Impact and Risk Analysis

- **System Dependencies:** none outward. Nothing in `src/lib/`, `src/app/api/` or the
  collection pipeline touches portfolio code. This is why the slice is safe to ship first.
- **Risk — an incomplete sweep.** The failure mode is a build that passes while a stale string
  survives in CSS, a FAQ answer or an alt attribute. **Mitigation:** a case-insensitive grep
  sweep over `src/` for `portfolio`, `holding`, `wallet`, `cost basis`, `P&L`, `tax`,
  `enclave`, `pricing`, `trial`, `ensemble`, `AUM`, `hit rate` after the edits; every
  surviving hit is either justified in the PR or removed.
- **Risk — deleting something still in use.** `HoldingsDonut` lives in the shared
  `charts.tsx`. **Mitigation:** remove it last, after `tsc --noEmit` confirms no importer.
- **Risk — the landing rewrite quietly invents new claims.** **Mitigation:** the copy rule in
  §2.3 — name the file, or cut the sentence.
- **Reversibility:** full. Everything removed is in git history; nothing here is a schema or
  data change.

---

## 4. Testing Strategy

No unit tests are added — there is no new logic to test. Verification is mechanical:

- `npx tsc --noEmit` and `npm run lint` clean.
- `npm run build` succeeds and the build output contains no `/portfolio` route.
- The grep sweep in §3 returns only justified hits.
- Manual pass: every dashboard nav item loads; `/portfolio` renders the 404 page; the landing
  page is read end to end against the copy rule.
- Confirm `/api/signals`, `/api/projections` and `/api/collect` are untouched — this spec must
  not appear in any diff under `src/app/api/` or `src/lib/`.
