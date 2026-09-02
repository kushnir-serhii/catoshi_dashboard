# Tasks: Forecasting-Core Scope Trim

Subtraction only. Ordered leaves-first so the compiler catches an over-eager deletion before
it reaches a shared file. Each slice ships independently.

---

## Slice 1 — Remove the Portfolio surface

- [x] Delete `src/app/(admin)/portfolio/page.tsx`.
- [x] Delete `src/components/pages/PortfolioPage.tsx` and its export in `components/pages/index.ts`.
- [x] Delete `src/components/panels/HoldingsPanel.tsx` and its export in `components/panels/index.ts`.
- [x] Delete `src/data/portfolio.ts`.
- [x] Drop the `portfolio` entry from `NAV_ITEMS` in `src/consts/nav.ts`.
- [x] Remove `HoldingsDonut` from `src/components/dashboard/charts.tsx` — **last**, after `tsc` confirms no importer remains.
- [x] Remove portfolio-only interfaces from `src/data/types.ts` once nothing imports them.
- [x] Remove the now-unused holdings rules from `src/app/styles/dashboard.css`.
- [x] `npx tsc --noEmit` and `npm run lint` clean.

**Done when:** `/portfolio` renders the 404 page, no navigation entry points at it, and no holdings figure exists in the running app.

---

## Slice 2 — Remove auth affordances

- [x] Remove the logout control from `src/components/layout/Header.tsx`.
- [x] Delete `src/assets/icons/nav/log-out.svg` if nothing else references it.
- [x] Confirm no sign-up, login or email-capture control exists anywhere in `src/`.

**Done when:** nothing in the UI implies an account exists.

---

## Slice 3 — Rewrite the landing page

Apply the copy rule throughout: **every sentence must be checkable against a file in `src/`. If you cannot name the file that makes it true, cut the sentence.**

- [x] Delete the `plans` array and the `#pricing` section, plus the nav anchor pointing at it.
- [x] Delete the `stats` array and its section. Do not substitute smaller invented numbers — a stats band may return only when spec 011 serves real aggregates.
- [x] `features`: delete card 01 (portfolio projection from holdings) and card 05 (holdings analytics). Rewrite card 02 — the product runs **one** LLM call through `src/lib/forecastProvider.ts`, not an ensemble of five models. Correct cards 03 and 04 to shipped behaviour.
- [x] `steps`: rewrite "Connect / Project / Act" to describe hourly snapshot collection → scenario generation from that snapshot → scoring against real prices. No wallet, no API keys, no "secure enclave", no rebalance alerts.
- [x] Hero: remove the "your portfolio into bull / base / bear scenarios" line, the "Read-only wallet access" badge, and the "Connect your first wallet in 60 seconds" CTA. The CTA becomes a link into the dashboard.
- [x] Audit `src/components/landing/FaqSection.tsx` against the same rule.
- [x] Add a visible non-financial-advice note beside every forecasting claim.
- [x] Remove dead rules from `src/app/styles/landing.css`.

**Done when:** the page can be read end to end and every claim traces to code.

---

## Slice 4 — Sweep and correct the record

- [x] Case-insensitive grep over `src/` for: `portfolio`, `holding`, `wallet`, `cost basis`, `P&L`, `tax`, `enclave`, `pricing`, `trial`, `ensemble`, `AUM`, `hit rate`. Every surviving hit is justified in the commit message or removed.
- [x] Remove `SIGNALS_REVALIDATE_SECONDS` from `src/consts/signals.ts` if unreferenced (`decisions.md` §8, defect 2). If something reads it, leave it and record why.
- [x] `CLAUDE.md`: remove `portfolio/` from the route list and any holdings mention.
- [x] Re-check `context/product/architecture.md` matches after the edits.
- [x] Tick the roadmap checkbox in `context/product/roadmap.md` (Phase 3 → Trim to the Forecasting Core) and update `context/README.md` §3.
- [x] `npm run build` succeeds; the build output contains no `/portfolio` route.

---

## Deliberately not in any slice

- Deleting `src/data/models.ts` — that is spec 011, Slice 1, and stays separately shippable.
- Any visual redesign of the landing page. Copy and sections only.
- Removing the Models page. It stays and becomes truthful in spec 011.
- Any change under `src/app/api/` or `src/lib/`. If this spec shows up in a diff there, something has gone wrong.
