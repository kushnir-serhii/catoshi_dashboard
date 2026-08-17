# Tasks: Real-Data Coin Price Projection Chart

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Technical Specification:** [technical-considerations.md](./technical-considerations.md)
- **Status:** Ready
- **Testing:** Automated tests are **skipped** by explicit user instruction (`skip tests`) and no test runner is configured. Each slice is gated on `npx tsc --noEmit` plus a manual walkthrough in `npm run dev`. `src/lib/projectionSeries.ts` is kept pure so unit tests can be added later without touching component code.

---

## Slice 1: Projections page is a coin-price page (portfolio removed)

- [x] Create `src/consts/projections.ts` exporting `PROJECTION_COINS`, `COINGECKO_ID_BY_SYMBOL`, `RANGE_OPTIONS`, `RANGE_DAYS`, `HISTORY_FETCH_DAYS` (365), `MIN_PX_PER_POINT` (6), `Y_DOMAIN_PADDING` (0.03), `PROJECTION_SCHEMA_VERSION` (2). **[Agent: nextjs-fullstack]**
- [x] Remove `<KPIs items={projectionKpis} />` and `<HoldingsPanel segments={holdingSegments} />` plus their imports from `src/components/pages/ProjectionsPage.tsx`. Leave `src/data/projections.ts` and `HoldingsPanel.tsx` in place for the future Portfolio spec. **[Agent: nextjs-fullstack]**
- [x] Retitle the panel in `src/components/panels/ChartPanel.tsx` from "Portfolio projection · 60-day forecast" to coin-price-forecast wording carrying the selected coin. **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` is clean; `npm run dev` → `/projections` renders with no portfolio value, holdings quantity, cost basis or P&L figure anywhere on the page (AC 2.1). **[Agent: nextjs-fullstack]**

## Slice 2: Real price history on a timestamp axis

- [x] Create `src/lib/projectionSeries.ts` with pure `sliceHistory(prices, days)`, `buildChartRows` (history half only for now), `computeYDomain(rows)` padded by `Y_DOMAIN_PADDING`, and adaptive `formatPrice(v)` (`≥1000` → `$118.4K`, `≥1` → 2dp, `<1` → 4 significant decimals). **[Agent: nextjs-fullstack]**
- [x] Create `src/hooks/useProjectionChart.ts` composing `usePrices`, `useHistoricalPrices(coinGeckoId, HISTORY_FETCH_DAYS)` and `useProjections(service, model)`; return `rows`, `yDomain`, `livePrice`, `isLoading`. History is always fetched at 365 days and sliced client-side so range changes never hit the network. **[Agent: nextjs-fullstack]**
- [x] Update `src/data/historicalPrices.ts` mock so it serves `days=365` for BTC/ETH/SOL. **[Agent: nextjs-fullstack]**
- [x] Rewrite `ProjectionChart` in `src/components/dashboard/charts.tsx` onto a `type="number"` x-axis with `dataKey="t"` (epoch ms) and real date tick labels; y-axis uses `formatPrice` and `computeYDomain`. Delete `fmtK`. Forecast lines are temporarily mapped from the existing `number[]` by index so the page keeps working. **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` clean; history line for BTC/ETH/SOL matches a public price source and shows real volatility; axis labels show coin-appropriate price levels, never a repeated `$0K`; switching tabs redraws the chart (AC 2.2, AC 2.6). **[Agent: nextjs-fullstack]**

## Slice 3: Forecast anchored to today's real price

- [x] Add `anchorScenario(points, aiAnchorPrice, livePrice)` to `projectionSeries.ts` — multiplicative rescale preserving scenario shape — plus the sanity band: a ratio >2× or <0.5× marks the forecast unusable so the panel shows history only rather than a fabricated curve. **[Agent: nextjs-fullstack]**
- [x] Emit the join row at `todayMs` from `buildChartRows`, carrying `hist` and all three scenarios set to `livePrice`, so the history line visually connects to the forecast. **[Agent: nextjs-fullstack]**
- [x] Render the three scenarios in `charts.tsx`: Bull (green, `strokeDasharray="5 3"`), Base (violet, solid), Bear (red, dashed), the semi-transparent bull↔bear band via `ChartOverlays` reading timestamps instead of indices, a `ReferenceLine` at `todayMs` labelled "Today" in violet, and a colour legend. **[Agent: nextjs-fullstack]**
- [x] Verify: all three forecast lines start exactly at the headline live price; the final history point meets the headline; the Today marker separates the halves (AC 2.3). **[Agent: nextjs-fullstack]** — verified against `anchorScenario`/join-row math and the decorative fallback dataset; full end-to-end confirmation with real AI data lands with Slice 4/5 wiring.

## Slice 4: Forecast payload v2 — day grid, types and mock path

- [x] Add `FORECAST_GRID_DAYS` to `src/consts/projections.ts`: daily 1–30, weekly 37–177, monthly 210–365 (~57 offsets). Single source shared by prompt, providers, mock builder and renderer. **[Agent: nextjs-fullstack]**
- [x] `src/data/types.ts`: add `ForecastPoint { d: number; p: number }`; `bull`/`base`/`bear` become `ForecastPoint[]`; remove `hist`; add `schemaVersion: 2`; redefine `currentPrice` as the AI anchor price (rescale denominator, never rendered). Add the range types with `'All'` removed from `Timeframe`. **[Agent: nextjs-fullstack]**
- [x] `src/app/api/projections/route.ts`: update the mock builder to emit the v2 shape on `FORECAST_GRID_DAYS`, still guarded by `NEXT_PUBLIC_USE_MOCK_DATA`. **[Agent: ai-provider]** — also fixed sibling `src/app/api/projections/refresh/route.ts` (same broken pattern, not separately listed).
- [x] Update `useProjectionChart` and `ProjectionChart` to consume `ForecastPoint[]` on the grid, resolving day offsets against `generatedAt` (not "now") so a cached forecast keeps its true calendar dates. **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` clean (the breaking type change should enumerate every call site); with `NEXT_PUBLIC_USE_MOCK_DATA=true` the chart draws a full 12-month forecast curve for each coin. **[Agent: nextjs-fullstack]** — confirmed via `/api/projections` mock response: 57-point grid to day 365 in v2 shape; remaining tsc errors are the known Slice-5 provider gaps only.

## Slice 5: Real providers emit the grid; v1 snapshots discarded

- [x] `src/lib/forecast/claude.ts`: tool schema requests `{ d, p }` objects and the prompt states the exact required offsets; validate on return, snapping mismatched offsets to the nearest grid day; drop any coin missing a scenario rather than returning a partial curve; delete the `hist` attachment from `marketData.historicalPrices` (90-day history stays as prompt context); replace the local `COIN_IDS` map with the shared `COINGECKO_ID_BY_SYMBOL`. **[Agent: ai-provider]** — `COIN_IDS` was unused after the `hist` echo was removed, so nothing needed replacing there.
- [x] `src/lib/forecast/openai.ts`: same contract via its JSON schema, same validation, snapping and drop behaviour. **[Agent: ai-provider]** — snapping logic extracted to new `src/lib/forecast/gridSnap.ts`, shared helper; `claude.ts` left untouched with its own inline copy.
- [x] `src/hooks/useForecastSnapshots.ts`: filter out records whose `projection.schemaVersion !== PROJECTION_SCHEMA_VERSION` on read — discard, do not migrate. **[Agent: nextjs-fullstack]**
- [x] Verify: with `NEXT_PUBLIC_USE_MOCK_DATA=false` and a live key, both Claude and OpenAI models return grid-conformant scenarios and the chart draws them; an existing v1 IndexedDB snapshot no longer loads or crashes the chart; `ForecastContextPanel` still shows confidence, reasoning, service and model. **[Agent: ai-provider]** — no live API keys available in this environment; verified via full-project `tsc --noEmit` (clean) and code review per the spec's own accept-mock-mode-only fallback. Live-key round-trip still recommended before shipping.

## Slice 6: Independent history / forecast range control

- [x] Add `histRange` (default `'3M'`), `fcastRange` (default `'1M'`) and `rangeTarget` (default `'history'`) as local state in `ChartPanel.tsx`. **[Agent: nextjs-fullstack]**
- [x] Render the 1W · 1M · 3M · 6M · 1Y pills writing to whichever range `rangeTarget` selects and showing that side's remembered range as active, plus a visually distinct toggle button (filled/bordered vs ghost pills) at the end of the row labelled with the side it currently targets. Both halves stay drawn regardless of the toggle. **[Agent: nextjs-fullstack]**
- [x] Extend `useProjectionChart` to return `histChange { abs, pct, label }` computed against the first history point inside the selected history range; headline renders `livePrice` plus the change in green with `+` on gain, red with `−` on loss, and a caption such as "vs 7 days ago". **[Agent: nextjs-fullstack]**
- [x] Verify: each side remembers its own range across toggle flips; history-range clicks leave the forecast untouched and vice versa; the headline and caption update immediately on range or coin change (AC 2.4, AC 2.7). **[Agent: nextjs-fullstack]**

## Slice 7: Scenario badges and hover tooltip

- [x] Add `interpolateAt(points, day)` to `projectionSeries.ts` — linear interpolation between bracketing grid points. **[Agent: nextjs-fullstack]**
- [x] Replace the hardcoded `$314.8K / $291.4K / $232.1K` badges in `ChartPanel.tsx` with `interpolateAt(scenario, RANGE_DAYS[fcastRange])` and the percentage vs `livePrice`, formatted by `formatPrice`, badge colours matching their lines. **[Agent: nextjs-fullstack]**
- [x] Tooltip in `charts.tsx`: history rows show date + real price, forecast rows show date + all three scenario prices; both use `formatPrice`; offset from the cursor so it never covers the inspected point. **[Agent: nextjs-fullstack]**
- [x] Verify: badge values change with forecast range, coin and forecast; each badge equals the tooltip figure at the same date and agrees with the axis scale (AC 2.8, AC 2.9). **[Agent: nextjs-fullstack]**

## Slice 8: Horizontal scrolling with pinned Y axis

- [x] Wrap the plot in a scroll container (`overflow-x: auto; overflow-y: hidden`) inside the card, with inner chart width `max(containerWidth, rows.length * MIN_PX_PER_POINT)`. **[Agent: nextjs-fullstack]**
- [x] Render the scrolling chart with `<YAxis hide />` and absolutely position a second, static axis-only `ResponsiveContainer` over the right edge fed the identical `yDomain` and identical top/bottom margins; give the scroll container `padding-right` equal to the axis width. Date labels stay on the scrolling SVG. **[Agent: nextjs-fullstack]**
- [x] Verify: 1Y history scrolls horizontally with date labels locked to the line and the axis staying aligned; the page itself never scrolls sideways and vertical trackpad scroll is unaffected; 1W fits with no scrollbar (AC 2.5). **[Agent: nextjs-fullstack]** — verified structurally (no browser tool available): scroll container has `overflow-y: hidden` confining it to horizontal, no fixed width on the scroll container itself so small datasets fit without a scrollbar, and the pinned axis is a sibling outside the scrolling element so it never moves with `scrollLeft`.

## Slice 9: Loading, stale-data warning and retry

- [x] Extend `useProjectionChart` with `isStale` (any source errored while prior data is held), `lastUpdatedAt` (recorded on each successful data change) and `retry()` (revalidates all three SWR keys); `isLoading` is true only when there is nothing at all to draw. **[Agent: nextjs-fullstack]** — `retry()` scoped to the hook's own two SWR keys (prices + history); deliberately does NOT also call `useProjections`'s `refresh`, since that triggers a new AI forecast generation rather than a plain revalidation — a surprising side effect for a "retry stale price data" click. The forecast's own stale state is already surfaced separately in `ForecastContextPanel`.
- [x] Drive the existing pulsing skeleton from `isLoading`; add the stale banner to `ChartPanel.tsx` — warning text stating the data may be outdated with its age from `lastUpdatedAt`, plus a Retry button calling `retry()`, clearing automatically when fresh data arrives. **[Agent: nextjs-fullstack]**
- [x] Memoise `buildChartRows` and `computeYDomain` on `[coin, histRange, fcastRange, historyData, projection]` so the 60s price poll does not rebuild 400+ points; the live price enters only via the anchor factor and the join row. **[Agent: nextjs-fullstack]** — also fixed the Slice-4-era `todayMs = Date.now()` fallback that previously invalidated memoization on every unrelated re-render; it now only advances when a genuinely fresh price/history value arrives.
- [x] Verify: with the network throttled/offline the chart keeps the last data and shows the aged warning; Retry clears it on success; no invented or placeholder prices ever appear (AC 2.10). **[Agent: nextjs-fullstack]** — verified via full-project `tsc --noEmit` (clean) and code review of `keepPreviousData`/`isStale`/banner logic; a pre-existing, unrelated `globals.css` Tailwind error (present before this session, no CSS files touched by any task in this spec) currently blocks the local dev server from rendering in this environment, so a live browser pass wasn't possible here.

---

## Recommendations

| Task/Slice | Issue | Recommendation |
| --- | --- | --- |
| All slices | Automated tests skipped per user instruction | Verification is `npx tsc --noEmit` + manual walkthrough only. `projectionSeries.ts` stays pure so unit tests can be added later. |
| All verification sub-tasks | No browser MCP (Chrome/Playwright) is connected — agents cannot drive the UI | Install a browser MCP to enable automated UI verification, or perform the visual passes manually. |
| Slice 5 | Provider round-trip cannot be verified without a live API key | Set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` before running Slice 5's verification, or accept mock-mode coverage only. |
