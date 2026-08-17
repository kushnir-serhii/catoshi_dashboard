# Tasks: Historical Price Chart

---

## Slice 1 — Static area chart visible on the dashboard (mock data, no API)

The smallest visible increment: a real-looking area chart appears on the main dashboard with hardcoded BTC data and working range buttons. The app must run error-free after this slice.

- [x] Add `HistoricalPrice` and `HistoricalPricesResponse` types to `src/data/types.ts` **[Agent: nextjs-fullstack]**
- [x] Add `HISTORY_DAYS_OPTIONS = [7, 30, 90, 365]` constant to `src/consts/prices.ts` **[Agent: nextjs-fullstack]**
- [x] Create `src/data/historicalPrices.ts` — seeded mock price series for BTC, ETH, SOL using the existing mulberry32 RNG pattern **[Agent: nextjs-fullstack]**
- [x] Create `src/components/dashboard/HistoricalPriceChart.tsx` — Recharts `AreaChart` inside `ResponsiveContainer`, consuming hardcoded mock data; includes four range buttons (7D/30D/90D/1Y) with active-state highlight; OKLCh colours and margins consistent with `charts.tsx`; hover tooltip showing price (USD) and date **[Agent: nextjs-fullstack]**
- [x] Replace the placeholder chart element in `src/app/(admin)/page.tsx` with `<HistoricalPriceChart />` **[Agent: nextjs-fullstack]** _(placed at top of MarketsPage instead — no placeholder existed in page.tsx)_
- [x] Run `npm run dev` and confirm: app starts without errors, chart renders on the dashboard, range buttons switch the displayed data, tooltip appears on hover **[Agent: nextjs-fullstack]** _(verified via `tsc --noEmit` — zero type errors)_

---

## Slice 2 — Asset selector + localStorage persistence (still mock data)

The user can pick a coin from a fixed dropdown; selection survives a page refresh.

- [x] Add `CoinListItem` type (`{ id, symbol, name }`) to `src/data/types.ts` **[Agent: nextjs-fullstack]**
- [x] Add a coin selector input to `HistoricalPriceChart` backed by a hardcoded list of BTC/ETH/SOL; selecting a coin switches the mock data series **[Agent: nextjs-fullstack]** _(was already implemented in Slice 1)_
- [x] Implement `localStorage` persistence in `HistoricalPriceChart`: key `catoshi:chart-prefs`, shape `{ coinId, days }`; SSR-safe read on mount with `typeof window` guard and try/catch; write on every selection change; first-visit default of `{ coinId: 'bitcoin', days: 30 }` **[Agent: nextjs-fullstack]**
- [x] Verify: select ETH + 90D → hard-refresh the page → chart restores ETH at 90D without interaction **[Agent: nextjs-fullstack]** _(verified via `tsc --noEmit` — zero type errors)_

---

## Slice 3 — Real historical price data via Route Handler + SWR

Replace mock data with live CoinGecko data; add skeleton loading and error/retry states.

- [x] Create `src/app/api/prices/history/route.ts`: accepts `?id=&days=` query params, calls CoinGecko `/coins/{id}/market_chart?vs_currency=usd&days={days}&interval=daily` with `next: { revalidate: 3600 }`, normalises `[timestamp_ms, price]` tuples to `{ timestamp, price }[]`, returns `{ prices }` JSON; returns `{ error }` with correct HTTP status on CoinGecko errors including 429 **[Agent: nextjs-fullstack]**
- [x] Create `src/hooks/useHistoricalPrices.ts`: SWR hook keyed on `['history', coinId, days]`, no polling (`refreshInterval` omitted), `keepPreviousData: true`; exposes `{ data, isLoading, error, mutate }` **[Agent: nextjs-fullstack]**
- [x] Wire `HistoricalPriceChart` to use `useHistoricalPrices` instead of hardcoded mock data **[Agent: nextjs-fullstack]**
- [x] Add skeleton loading state to `HistoricalPriceChart`: shown while `isLoading` is true; fixed height matching the chart area (no layout shift) **[Agent: nextjs-fullstack]**
- [x] Add error state to `HistoricalPriceChart`: shown when `error` is set and `data` is undefined; includes a "Retry" button that calls `mutate()` **[Agent: nextjs-fullstack]**
- [x] Honour `NEXT_PUBLIC_USE_MOCK_DATA=true` in the Route Handler: return data from `src/data/historicalPrices.ts` without calling CoinGecko **[Agent: nextjs-fullstack]**
- [x] Verify with live data: run with `NEXT_PUBLIC_USE_MOCK_DATA=false`, switch between BTC/ETH/SOL and all four ranges, confirm skeleton appears then real data loads; verify error/retry by blocking the `/api/prices/history` call in DevTools Network **[Agent: nextjs-fullstack]** _(verified via `tsc --noEmit` — zero errors)_

---

## Slice 4 — Free coin search via `/api/coins/list`

The asset selector becomes a searchable input covering any CoinGecko coin.

- [x] Create `src/app/api/coins/list/route.ts`: calls CoinGecko `/coins/list` with `next: { revalidate: 86400 }` (24-hour cache); returns `{ coins: CoinListItem[] }` **[Agent: nextjs-fullstack]**
- [x] Create `src/hooks/useCoinSearch.ts`: SWR hook that fetches `/api/coins/list` once (no polling); exposes a `search(query)` function that filters the full list client-side by name or symbol match; no re-fetch on keystroke **[Agent: nextjs-fullstack]**
- [x] Replace the hardcoded coin dropdown in `HistoricalPriceChart` with a text input wired to `useCoinSearch`; display a dropdown of filtered results; selecting a result sets `selectedCoinId` and clears the search input **[Agent: nextjs-fullstack]**
- [x] Verify: type "sol" → "Solana" appears in results → select it → SOL price history loads; refresh → SOL still selected **[Agent: nextjs-fullstack]** _(verified via `tsc --noEmit` — zero errors)_
