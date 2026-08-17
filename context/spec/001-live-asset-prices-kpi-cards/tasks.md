# Task List: Live Asset Prices — KPI Cards & Asset List

- **Spec:** `context/spec/001-live-asset-prices-kpi-cards/`
- **Functional Spec:** `functional-spec.md`
- **Technical Spec:** `technical-considerations.md`

---

## Slice 1 — Mock data layout alignment

> Goal: `USE_MOCK=true` renders a KPI card layout visually identical to the live experience.

- [x] Update `src/data/markets.ts`: replace the current `marketKpis` array (Total Market Cap, BTC Dominance, etc.) with three entries mirroring the live structure — one per asset (BTC/ETH/SOL) with realistic hardcoded price and delta values. **[Agent: nextjs-fullstack]**
- [x] Start the dev server with `NEXT_PUBLIC_USE_MOCK_DATA=true` and verify the KPI card layout shows 3 asset cards, each with a price and 24h change value. **[Agent: general-purpose]**

---

## Slice 2 — Shared type foundation

> Goal: `AssetPrice` and `PriceMap` are canonical types defined once in `src/data/types.ts`.

- [x] In `src/data/types.ts`: add `AssetPrice = { usd: number; usd_24h_change: number }` and `PriceMap = Record<string, AssetPrice>`. **[Agent: nextjs-fullstack]**
- [x] In `src/lib/coingecko.ts`: remove the local `PriceMap` definition and import it from `src/data/types.ts`. Confirm `npx tsc --noEmit` passes with no errors. **[Agent: nextjs-fullstack]**

---

## Slice 3 — Route Handler: all 8 assets + optional API key

> Goal: `GET /api/prices` returns live prices for all 8 tracked assets and supports an optional CoinGecko API key.

- [x] Update `src/app/api/prices/route.ts` to support all 8 CoinGecko IDs: `bitcoin, ethereum, solana, bittensor, chainlink, arbitrum, render-token, lido-dao`. **[Agent: nextjs-fullstack]**
- [x] Add optional API key header logic: attach `x-cg-pro-api-key` (Pro base URL) or `x-cg-demo-api-key` (Demo) when `COINGECKO_API_KEY` env var is present; send no auth header when absent. **[Agent: nextjs-fullstack]**
- [x] Update `.env.example` with `COINGECKO_BASE_URL` and `COINGECKO_API_KEY` entries and their descriptions. **[Agent: nextjs-fullstack]**
- [x] Verify the Route Handler by running: `curl "http://localhost:3000/api/prices?ids=bitcoin,ethereum,solana,bittensor,chainlink,arbitrum,render-token,lido-dao"`. Confirm all 8 keys are present in the JSON response. **[Agent: general-purpose]**

---

## Slice 4 — KPI Cards UI refinements

> Goal: A single countdown indicator replaces the per-card badge; stale warning uses the project's CSS custom property.

- [x] In `src/components/panels/KPIs.tsx`: move the `{countdown}s` indicator from a per-card badge (currently repeated 3×) to a single shared location — a row below the KPI cards or the page-level toolbar. **[Agent: nextjs-fullstack]**
- [x] In the same file: replace the hardcoded `text-yellow-500` Tailwind class with the project's CSS custom property for warning color (e.g. `var(--warning)` or `var(--amber)`), consistent with how delta colors use `var(--green)` / `var(--red)`. **[Agent: nextjs-fullstack]**
- [x] Start the app with `NEXT_PUBLIC_USE_MOCK_DATA=false`. Confirm: exactly one countdown indicator is visible on the dashboard; the stale warning badge uses the CSS variable color (not yellow-500). **[Agent: general-purpose]**

---

## Slice 5 — Asset list: full 8-asset live overlay + skeleton

> Goal: All 8 asset rows show live prices and skeletons on initial load; no row falls back to mock data.

- [x] In `src/components/pages/MarketsPage.tsx`: extend the live price and 24h-change overlay from the current 3 rows (BTC/ETH/SOL) to all 8 by removing the filter boundary that limits live data to those 3 assets. **[Agent: nextjs-fullstack]**
- [x] In the same file: extend `SkeletonCell` loading state to all 8 live rows on initial load, not only the 3 currently covered. **[Agent: nextjs-fullstack]**
- [x] Verify in a browser: all 8 asset rows display live price and 24h change values; skeleton loaders appear on a hard refresh before data arrives; no row shows static mock values when `USE_MOCK=false`. **[Agent: general-purpose]**

---

## Slice 6 — Full acceptance criteria QA

> Goal: Every acceptance criterion in `functional-spec.md` §2.1–§2.4 is confirmed against a live dev build.

- [x] Run the dev server with `NEXT_PUBLIC_USE_MOCK_DATA=false` and `COINGECKO_BASE_URL` set to the public CoinGecko endpoint.
- [x] §2.1 KPI Cards: each card shows live USD price and 24h change (positive/negative styled correctly); skeleton placeholders appear on first load and are replaced by real values. **[Agent: general-purpose]**
- [x] §2.2 Asset List: all 8 rows show live USD price and 24h change; skeleton loaders show on first visit. **[Agent: general-purpose]**
- [x] §2.3 Auto-refresh: prices update automatically after 60 seconds; a single countdown indicator shows remaining seconds; values update smoothly without re-showing skeleton loaders. **[Agent: general-purpose]**
- [x] §2.4 Error state: simulate a network failure (block CoinGecko host or go offline); confirm last good prices remain visible, stale warning appears, countdown continues, warning clears after a successful refresh. **[Agent: general-purpose]**

---

## Recommendations

| Task / Slice | Issue | Recommendation |
|---|---|---|
| Slices 1, 3, 4, 5, 6 — verification steps | Assigned to `general-purpose` — no browser MCP available for automated UI checks | Install a Playwright or Puppeteer MCP to enable headless UI verification |
| Slice 6 — network failure simulation | Requires manually blocking CoinGecko or going offline in DevTools | Consider a QA agent with network-intercept support (e.g. Playwright `route.abort()`) |
