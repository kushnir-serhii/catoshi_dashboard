# Technical Specification: Live Asset Prices — KPI Cards & Asset List

- **Functional Specification:** `context/spec/001-live-asset-prices-kpi-cards/functional-spec.md`
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

The feature follows the server-side proxy pattern from the architecture: a single Next.js Route Handler fetches all asset prices from CoinGecko and caches the response server-side for 60 seconds. A SWR hook in the browser polls that Route Handler on the same 60-second interval, driving a built-in countdown timer. Two UI components consume the hook — the KPI cards panel and the asset list table.

The core infrastructure (Route Handler, SWR hook, KPI cards, mock data toggle) is already implemented. This revision expands live price coverage from 3 assets to all 8 tracked assets, adds optional CoinGecko API key support, aligns mock data layout with the live layout, and cleans up two minor UI inconsistencies (countdown placement and stale warning color).

**Systems affected:** `src/app/api/prices/route.ts` (modified), `src/lib/coingecko.ts` (modified), `src/data/types.ts` (minor), `src/components/panels/KPIs.tsx` (modified), `src/components/pages/MarketsPage.tsx` (modified), `src/data/markets.ts` (modified).

---

## 2. Proposed Solution & Implementation Plan

### 2.1 Dependencies

No new packages are required. `swr` is already installed.

---

### 2.2 Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK_DATA` | No | When `true`, skips all API calls and uses static mock data |
| `COINGECKO_BASE_URL` | Yes | Base URL for CoinGecko API (free or Pro endpoint) |
| `COINGECKO_API_KEY` | No | Optional API key; if present, appended as auth header to upstream requests |

---

### 2.3 Route Handler — `src/app/api/prices/route.ts`

**Contract:**
- `GET /api/prices?ids=bitcoin,ethereum,solana,...`
- Accepts a comma-separated list of CoinGecko coin IDs via the `ids` query parameter.
- Proxies to CoinGecko `/simple/price` with `vs_currencies=usd&include_24hr_change=true`.
- Returns a `PriceMap` JSON object keyed by coin ID.
- Next.js `fetch` cache: `{ next: { revalidate: 60 } }` — server-side 60-second TTL.
- Returns `502` with a JSON error body if the upstream request fails.

**Changes required:**
- **Expand to all 8 assets:** The client must request (and the Route Handler must support) all 8 tracked asset IDs. Full set: `bitcoin, ethereum, solana, bittensor, chainlink, arbitrum, render-token, lido-dao`. Verify these IDs against CoinGecko `/coins/list` before shipping — an incorrect ID returns an empty record silently.
- **Optional API key header:** If `COINGECKO_API_KEY` env var is present, attach it as `x-cg-pro-api-key` (when using the Pro base URL) or `x-cg-demo-api-key` (Demo). If absent, no auth header is sent.

---

### 2.4 CoinGecko Client — `src/lib/coingecko.ts`

**Changes required:**
- Move the `PriceMap` type into `src/data/types.ts` (see §2.5).
- Add a named `AssetPrice` type: `{ usd: number; usd_24h_change: number }`. `PriceMap` becomes `Record<string, AssetPrice>`.

No changes to the `fetchPrices` function signature or behavior.

---

### 2.5 Shared Types — `src/data/types.ts`

- Move `PriceMap` from `src/lib/coingecko.ts` into this file.
- Add `AssetPrice = { usd: number; usd_24h_change: number }`.

---

### 2.6 SWR Hook — `src/hooks/usePrices.ts`

No structural changes. The hook already implements:
- `refreshInterval: 60 000 ms`
- `keepPreviousData: true`
- `isLoading` (first load, no prior data)
- `isStale` (error on re-fetch, prior data still present)
- 60-second countdown timer (resets on each successful `data` update)

The hook will now be called with all 8 asset IDs instead of 3 — no internal change needed.

---

### 2.7 KPI Cards — `src/components/panels/KPIs.tsx`

**Changes required:**
- **Stale warning color:** Replace the hardcoded `text-yellow-500` Tailwind class with the project's CSS custom property for warning color (e.g. `var(--warning)` or `var(--amber)`), consistent with how delta colors use `var(--green)` / `var(--red)`.
- **Countdown placement:** Move the `{countdown}s` indicator from a per-card badge (currently repeated 3×) to a single global location — either a shared row below the KPI cards or the page-level toolbar. Each card should not independently show the same countdown.

---

### 2.8 Asset List — `src/components/pages/MarketsPage.tsx`

**Changes required:**
- **Extend live price overlay to all 8 assets:** Currently only rows matching BTC/ETH/SOL receive live `px` and `d24` values; the other 5 rows (TAO, LINK, ARB, RNDR, LDO) always show mock data. Update the overlay so all 8 rows receive live prices when `USE_MOCK=false`. The `usePrices` call already returns the full map — this is a filter boundary change, not a new fetch.
- **Skeleton for all 8 rows:** Extend `SkeletonCell` loading state to all 8 live rows on initial load, not only the 3 current ones.

*Note:* Volume, market cap, sparkline, projection, and confidence columns remain on static mock data in this spec.

---

### 2.9 Mock Data — `src/data/markets.ts`

**Changes required:**
- **Align `marketKpis` with live KPI layout:** The current mock `marketKpis` array represents different metrics (Total Market Cap, BTC Dominance, 24h Volume, Fear & Greed) than the live UI (BTC/ETH/SOL price cards). Replace with three entries that mirror the live structure — one per asset (BTC, ETH, SOL) with realistic hardcoded prices and delta values. The `USE_MOCK=true` development experience should be visually identical in layout to the live experience.

---

## 3. Impact and Risk Analysis

**System Dependencies:**
- This feature depends exclusively on the CoinGecko public API. No authentication or database is required.
- `src/data/markets.ts` is shared with other pages (Portfolio, Signals). Only `marketKpis` is changed in this spec; `marketAssets` is untouched.

**Potential Risks & Mitigations:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| CoinGecko free-tier rate limit (10 req/min per IP) | Medium | The 60-second `revalidate` on the Route Handler means at most 1 upstream call per minute per Vercel edge node. `COINGECKO_API_KEY` is available as a higher-limit escape hatch. |
| CoinGecko coin ID mismatch (e.g. `render-token` vs `render`) | Low | Verify all 8 IDs against `/coins/list` before shipping. Incorrect IDs return empty records silently rather than errors. |
| `NEXT_PUBLIC_USE_MOCK_DATA` guard bypassed server-side | Low | The Route Handler has no mock guard. Document in `.env.example` that tests must mock `global.fetch`, not rely on this env flag. |
| Countdown drift after tab hibernation | Low | Browser-throttled `setInterval` may drift cosmetically. SWR's actual polling is unaffected. No mitigation needed. |

---

## 4. Testing Strategy

- **Unit — price map transform:** Test that the raw CoinGecko response shape maps correctly to `PriceMap` / `AssetPrice` for valid, partial, and empty responses.
- **Unit — stale/loading state derivation:** Test the `isLoading` and `isStale` boolean logic in `usePrices` for the four states: (no data, no error), (no data, error), (data, no error), (data, error).
- **Integration — Route Handler:** Mount the Route Handler in a test environment with `global.fetch` mocked. Assert the correct JSON shape and HTTP status for valid IDs, missing `ids` param, and upstream failure (502).
- **Manual QA:** Execute the acceptance criteria checklist in `functional-spec.md` against a local dev build with `NEXT_PUBLIC_USE_MOCK_DATA=false` and `COINGECKO_BASE_URL` set to the public endpoint.
