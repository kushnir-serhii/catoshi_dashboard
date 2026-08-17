# Task List: Asset List with Live Sparklines

- **Spec:** `context/spec/006-asset-list-live-sparklines/functional-spec.md`
- **Technical Spec:** `context/spec/006-asset-list-live-sparklines/technical-considerations.md`
- **Status:** Ready

---

## Slice 1: New `/api/markets` Route Handler — top-10 live data accessible from the app

- [x] Add `MARKETS_PAGE_SIZE = 10` constant to `src/consts/prices.ts`. **[Agent: nextjs-fullstack]**
- [x] Add `MarketListItem` type to `src/lib/marketData.ts`: fields `id`, `symbol`, `name`, `image`, `current_price`, `price_change_percentage_24h`, `market_cap`, `total_volume`, `sparkline_in_7d: { price: number[] }`. **[Agent: nextjs-fullstack]**
- [x] Create `src/app/api/markets/route.ts`: GET handler calling CoinGecko `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true&price_change_percentage=24h`, `revalidate: 60`, returns `MarketListItem[]`, 502 on upstream error. **[Agent: nextjs-fullstack]**
- [x] Add mock guard to the Route Handler: when `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, return a mock `MarketListItem[]` from `src/data/markets.ts` (minimal placeholder until Slice 4 aligns the mock shape). **[Agent: nextjs-fullstack]**
- [x] Verify: start dev server and run `curl "http://localhost:3000/api/markets"` — confirm a JSON array of 10 objects each with `current_price`, `market_cap`, `total_volume`, and a `sparkline_in_7d.price` array. **[Agent: nextjs-fullstack]**

---

## Slice 2: `useMarkets` hook + table wired to live price, change, market cap, and volume

- [x] Create `src/hooks/useMarkets.ts`: SWR hook calling `/api/markets`, `refreshInterval: PRICES_REFRESH_INTERVAL_MS`, `keepPreviousData: true`, returns `{ assets: MarketListItem[] | null, isLoading, isStale, countdown }` — mirror `usePrices` pattern exactly. **[Agent: nextjs-fullstack]**
- [x] In `MarketsPage.tsx` `<LiveMarketsContent>`: call `useMarkets()` alongside the existing `usePrices()` call — do not remove `usePrices`, KPI cards still use it. **[Agent: nextjs-fullstack]**
- [x] Map `assets` from `useMarkets` to table rows: populate price, 24h change, market cap, and volume columns with live values. Leave the Trend column on mock data for now. **[Agent: nextjs-fullstack]**
- [x] Extend `SkeletonCell` loading state to all 6 columns for all 10 rows when `isLoading === true`. **[Agent: nextjs-fullstack]**
- [x] Verify: hard-reload `http://localhost:3000/markets` — 10 skeleton rows on first load replaced by live data; price, 24h change, market cap, and volume columns all show real values. **[Agent: nextjs-fullstack]**

---

## Slice 3: Stale-data warning on the asset table

- [x] In `MarketsPage.tsx`: when `isStale === true` from `useMarkets`, show `<span style={{ color: 'var(--warning)' }}>Data may be outdated</span>` below the asset table — same markup as the KPI footer. Hide when `false`. **[Agent: nextjs-fullstack]**
- [x] Verify: DevTools → Network → "Offline", wait 60 seconds — last-known values remain visible and the stale warning appears below the table. Restore network — warning disappears after the next successful fetch. **[Agent: nextjs-fullstack]**

---

## Slice 4: Real 7-day sparklines via `SparklineChart`

- [x] Update `src/data/markets.ts`: replace `spark: number` with `sparkline: number[]` in the `MarketAsset` type and all mock rows (use short static arrays of 7 plausible values). Fix any remaining TypeScript references to `spark`. **[Agent: nextjs-fullstack]**
- [x] Create `src/components/dashboard/SparklineChart.tsx`: Recharts `LineChart` with one `Line`, no `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, or dot. Props: `prices: number[]`, `isPositive: boolean`. Color `#22c55e` when positive, `#ef4444` when not. `isAnimationActive={false}`. `ResponsiveContainer` with `height={40}`. Returns `null` on empty `prices`. **[Agent: nextjs-fullstack]**
- [x] In `MarketsPage.tsx`: replace the existing SVG sparkline with `<SparklineChart prices={a.sparkline_in_7d.price} isPositive={a.price_change_percentage_24h >= 0} />`. **[Agent: nextjs-fullstack]**
- [x] Verify: reload `http://localhost:3000/markets` — Trend column shows small line charts for all 10 rows, green for weekly-up assets, red for weekly-down. Run `npx tsc --noEmit` — zero errors. **[Agent: nextjs-fullstack]**

---

## Slice 5: Sortable column headers

- [x] In `MarketsPage.tsx`: add `useState<{ key: keyof MarketListItem; dir: 'asc' | 'desc' }>` initialised to `{ key: 'market_cap', dir: 'desc' }`. Sort the `assets` array by this state before mapping to rows. **[Agent: nextjs-fullstack]**
- [x] Add `onClick` to each column header: first click sets that key + `'asc'`; clicking the already-active column toggles `dir`. **[Agent: nextjs-fullstack]**
- [x] Show a `▲`/`▼` indicator on the active column header only. **[Agent: nextjs-fullstack]**
- [x] Verify: default order is largest market cap first; clicking "Price" sorts ascending then descending on second click; active column shows arrow; others do not. **[Agent: nextjs-fullstack]**
