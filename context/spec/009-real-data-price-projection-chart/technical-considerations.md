# Technical Specification: Real-Data Coin Price Projection Chart

- **Functional Specification:** [context/spec/009-real-data-price-projection-chart/functional-spec.md](../functional-spec.md)
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

The projections page becomes a **single-coin price page** by separating the three data concerns that are currently entangled in one AI payload:

| Concern | Today | After |
|---|---|---|
| Price history | `ProjectionData.hist` — 90 seeded/AI-attached points, 6h-cached | `/api/prices/history?id=&days=365` via `useHistoricalPrices` — real CoinGecko daily closes, 1h cache |
| Current price | `ProjectionData.currentPrice` — whatever the model guessed | `usePrices` — live CoinGecko price, 60s poll |
| Forecast | AI, 60 implicit-daily points | AI, ~57 points on an explicit **non-uniform day grid** spanning a full year |

Splitting these fixes the root cause of the contradictory numbers on screen: the headline, the axis, the badges and the tooltip all derive from **one** anchor — the live price — and the forecast scenarios are rescaled onto that anchor at render time. It also means a failed or stale AI forecast can no longer blank out or falsify the real price history.

The chart itself is rewritten around a **timestamp x-axis** (currently an array index), which is what makes independent history/forecast ranges, real date labels, and horizontal scrolling tractable.

**Affected files:**

| File | Change |
|---|---|
| `src/consts/projections.ts` | **New** — ranges, day grid, coin↔CoinGecko id map, layout constants |
| `src/data/types.ts` | Modified — `ForecastPoint`, `ProjectionData` v2, range types |
| `src/lib/projectionSeries.ts` | **New** — pure series maths (anchor, slice, interpolate, domain, format) |
| `src/lib/forecast/claude.ts` | Modified — tool schema emits the day grid |
| `src/lib/forecast/openai.ts` | Modified — same contract |
| `src/app/api/projections/route.ts` | Modified — mock builder to v2 shape |
| `src/hooks/useProjectionChart.ts` | **New** — composes the three data sources into one view model |
| `src/hooks/useForecastSnapshots.ts` | Modified — discard v1 snapshots |
| `src/components/dashboard/charts.tsx` | Modified — `ProjectionChart` rewritten |
| `src/components/panels/ChartPanel.tsx` | Modified — title, range control, headline, badges, stale banner |
| `src/components/pages/ProjectionsPage.tsx` | Modified — portfolio panels removed |
| `src/data/historicalPrices.ts` | Modified — mock must serve `days=365` |

No new external services, no new env vars, no database changes.

---

## 2. Proposed Solution & Implementation Plan

### 2.1 Forecast Payload Contract (breaking change)

The AI currently returns `bull` / `base` / `bear` as `number[]`, where the array index is implicitly "days from today". Sixty daily values cannot serve a 1Y forecast range, and asking for 365 values per scenario per coin triples the output tokens and invites wrong-length arrays.

Instead each scenario becomes a list of **explicit `(dayOffset, price)` points on a non-uniform grid** — dense near today, sparse far out:

| Segment | Spacing | Points |
|---|---|---|
| Days 1–30 | daily | 30 |
| Days 37–177 | weekly | 21 |
| Days 210–365 | monthly | 6 |
| | | **57** |

Roughly today's token cost, covering twelve months instead of two. The grid is a single exported constant (`FORECAST_GRID_DAYS` in `src/consts/projections.ts`) shared by the prompt, both providers, the mock builder and the renderer — the grid is never re-derived at a call site.

Every forecast range gets appropriate density: 1W → 7 points, 1M → 30, 3M → 39, 6M → 51, 1Y → 57.

**New types** (`src/data/types.ts`):

| Type | Shape | Notes |
|---|---|---|
| `ForecastPoint` | `{ d: number; p: number }` | `d` = days from generation date (≥1), `p` = USD price |
| `ProjectionData` | `bull` / `base` / `bear` become `ForecastPoint[]`; `hist` **removed**; `schemaVersion: 2` added | `currentPrice` is retained but redefined as *the AI's anchor price at generation time* — used only as the rescale denominator, never rendered |

`ProjectionsResponse`, the `/api/projections` cache key, the 6h TTL and the `'projections'` revalidation tag are unchanged.

**Provider changes** (`claude.ts`, `openai.ts`): the tool schema / JSON schema asks for `{ d, p }` objects and the prompt states the exact offsets required. Both providers validate on return — a scenario whose offsets don't match `FORECAST_GRID_DAYS` is snapped to the grid by nearest-offset match, and a coin missing any scenario is dropped from the response rather than surfacing a partial curve. The `hist` attachment from `marketData.historicalPrices` is deleted; `marketData` keeps supplying 90-day history to the **prompt** as forecast context.

---

### 2.2 Series Maths — `src/lib/projectionSeries.ts`

Pure, dependency-free functions, unit-testable in isolation and shared by chart, badges and headline so the numbers cannot diverge.

| Function | Responsibility |
|---|---|
| `anchorScenario(points, aiAnchorPrice, livePrice)` | Multiplies every `p` by `livePrice / aiAnchorPrice`, preserving scenario shape while forcing day 0 to the real traded price. This is what satisfies AC 2.3 ("none begins at a value the coin is not currently trading at"). |
| `interpolateAt(points, day)` | Linear interpolation between the two bracketing grid points — gives an exact scenario value at the range endpoint even when no grid point lands there. Feeds the badges. |
| `sliceHistory(prices, days)` | Trims the cached 365-day history to the selected history range. |
| `buildChartRows(history, scenarios, todayMs, histDays, fcastDays)` | Merges both halves into `{ t, hist?, bull?, base?, bear? }[]` keyed on epoch-ms timestamps. Emits a single **join row** at `todayMs` carrying `hist` *and* all three scenarios set to `livePrice` — this is what visually connects the history line to the three forecast lines (AC 2.2, final history point meets the headline). |
| `computeYDomain(rows)` | Min/max over **only the rows in the current window**, padded ±3%. Recomputed on every range or coin change, so the lines fill the chart height instead of sitting in a flat strip (AC 2.6). |
| `formatPrice(v)` | Adaptive: `≥1000` → `$118.4K`, `≥1` → 2dp, `<1` → 4 significant decimals. Used by axis, tooltip, badges and headline alike — the single formatter is what makes AC 2.8's "badge figures agree with the axis" hold by construction. |

The fixed `fmtK` (`'$' + Math.round(v/1000) + 'K'`) is deleted — it is the direct cause of the repeated "$0K" labels on SOL.

---

### 2.3 Data Composition — `src/hooks/useProjectionChart.ts`

One hook, so `ChartPanel` never juggles three loading/error states:

**Input:** `{ coin, service, model, histRange, fcastRange }`

**Composes:**

| Source | Call | Cadence |
|---|---|---|
| `usePrices` | the three CoinGecko ids | 60s poll |
| `useHistoricalPrices` | `(coinGeckoId, 365)` — always 365, sliced client-side | fetch once per coin per session |
| `useProjections` | `(service, model)` | 1h SWR / 6h server cache |

Fetching a flat 365 days and slicing locally means **changing the history range never triggers a network request**, and changing either range never triggers an AI call.

**Returns:** `rows`, `yDomain`, `livePrice`, `histChange { abs, pct, label }`, `badges { bull, base, bear }`, `confidence`, `reasoning`, `isLoading`, `isStale`, `lastUpdatedAt`, `retry()`.

- `isLoading` — true only when there is nothing at all to draw (drives the pulsing placeholder, AC 2.10).
- `isStale` — any source errored while prior data is still held (`keepPreviousData` is already set on all three hooks, so the chart never blanks).
- `lastUpdatedAt` — timestamp recorded on each successful data change, so the warning can state *how old* the data is.
- `retry()` — revalidates all three SWR keys.
- `histChange` — computed against the first history point **inside the selected history range**, with a label derived from that range (`"vs 7 days ago"`), satisfying AC 2.7.

---

### 2.4 Chart Rendering — `ProjectionChart` in `charts.tsx`

**X axis:** `type="number"`, `dataKey="t"` (epoch ms), domain `[historyStart, todayMs + fcastDays * 86400000]`. Ticks are chosen from the row timestamps and formatted as real dates; the `todayMs` tick renders as "Today" in violet. This replaces the current index-based axis and its relative `-3w` / `+2mo` labels.

**Series** (Recharts, as today): `Area hist` (green) · `Line bull` (green, `strokeDasharray="5 3"`) · `Line base` (violet, solid) · `Line bear` (red, dashed) · `ReferenceLine` at `todayMs`. The existing `ChartOverlays` `Customized` component keeps painting the bull↔bear confidence band, updated to read timestamps instead of indices.

**Horizontal scrolling (AC 2.5):**

```
┌──────────────────────────────┬───────┐
│  scrollable plot        →    │ $165  │  ← pinned axis overlay
│  (overflow-x: auto)          │ $150  │     (static, pointer-events: none)
└──────────────────────────────┴───────┘
```

- Inner chart width = `max(containerWidth, rows.length * MIN_PX_PER_POINT)` (`MIN_PX_PER_POINT = 6`). When the span fits, the max resolves to `containerWidth` and no scrollbar appears — AC 2.5's "no scrolling when it fits" falls out for free.
- The scroll container is `overflow-x: auto; overflow-y: hidden` and sits **inside** the card, so the page never scrolls sideways.
- The scrolling chart renders with `<YAxis hide />`; a second, static `ResponsiveContainer` holding **only** a `YAxis` is absolutely positioned over the right edge, fed the identical `yDomain`. The scroll container carries `padding-right` equal to the axis width so the line never hides under it.
- Date labels live on the scrolling SVG, so they stay locked to the line as the user scrolls.

**Tooltip:** history rows show date + real price; forecast rows show date + all three scenarios; both use `formatPrice`. Offset from the cursor so it never covers the inspected point.

---

### 2.5 Range Control (AC 2.4)

Two independent range values and one target toggle, held as local state in `ChartPanel`:

| State | Type | Default |
|---|---|---|
| `histRange` | `'1W' \| '1M' \| '3M' \| '6M' \| '1Y'` | `'3M'` |
| `fcastRange` | same | `'1M'` |
| `rangeTarget` | `'history' \| 'forecast'` | `'history'` |

The five range buttons write to whichever range `rangeTarget` selects, and show that range as active — so flipping the toggle back reveals each side's own remembered selection. `'All'` is removed from `Timeframe`. The toggle button sits at the end of the row, visually distinct from the range pills (filled/bordered rather than ghost) and labelled with the side it currently targets, so the active side is unambiguous.

Both halves are always drawn regardless of the toggle — the toggle governs *which range value the buttons edit*, never *what is rendered*.

---

### 2.6 Panel Chrome — `ChartPanel.tsx`

| Element | Change |
|---|---|
| Title | `"Portfolio projection · 60-day forecast"` → coin price forecast wording carrying the selected coin and forecast range |
| Headline | Hardcoded `+ $12,409.22 · 5.26%` / `vs 30 days ago` → `livePrice` + `histChange` from the hook; green/`+` on gain, red/`−` on loss |
| Scenario badges | Hardcoded `$314.8K / $291.4K / $232.1K` → `interpolateAt(scenario, fcastDays)` plus percent vs `livePrice`, formatted by `formatPrice` |
| Stale banner | **New** — shown when `isStale`: warning text with data age from `lastUpdatedAt` and a Retry button calling `retry()`; clears automatically when fresh data arrives |
| Loading | Existing pulsing skeleton retained, now driven by the hook's `isLoading` |

Coin tabs, the gear/settings modal, snapshot save/load and `ForecastContextPanel` are untouched in behaviour. Switching tabs changes `coin`, which re-derives every one of the above from the same hook — satisfying AC 2.1's "switching tabs redraws everything".

---

### 2.7 Page Composition — `ProjectionsPage.tsx`

Removed: `<KPIs items={projectionKpis} />` and `<HoldingsPanel segments={holdingSegments} />`, with their imports. Neither symbol is referenced anywhere else in `src/` outside `src/data/projections.ts`, so the mock data stays in place for the future Portfolio spec to consume.

Kept unchanged: `ChartPanel`, `AIPanel`, `ScenarioPanel`, `WatchlistPanel`, `SignalsPanel`. `HoldingsPanel` itself is not deleted — relocating it into `PortfolioPage` belongs to the separate Portfolio feature, per this spec's Out-of-Scope section.

---

### 2.8 Constants — `src/consts/projections.ts` (new)

Per the project constants rule, every value used by two or more files:

| Constant | Purpose |
|---|---|
| `PROJECTION_COINS` | `['BTC','ETH','SOL']` tab list |
| `COINGECKO_ID_BY_SYMBOL` | `BTC→bitcoin`, `ETH→ethereum`, `SOL→solana` — replaces the local `COIN_IDS` map currently duplicated inside `forecast/claude.ts` |
| `RANGE_OPTIONS` | `['1W','1M','3M','6M','1Y']` |
| `RANGE_DAYS` | `{ '1W':7, '1M':30, '3M':90, '6M':180, '1Y':365 }` |
| `FORECAST_GRID_DAYS` | the ~57 day offsets of §2.1 |
| `HISTORY_FETCH_DAYS` | `365` |
| `MIN_PX_PER_POINT` | `6` — scroll-width threshold |
| `Y_DOMAIN_PADDING` | `0.03` |
| `PROJECTION_SCHEMA_VERSION` | `2` |

---

## 3. Impact and Risk Analysis

### System Dependencies

- **`/api/prices/history`** gains a second consumer (it already serves `HistoricalPriceChart` on the Markets page). Read-only, no contract change; the 1h `revalidate` and CoinGecko rate limits are shared. Three coins × 365 days is one cached request per coin per hour across all users.
- **`/api/projections` + `/api/projections/refresh`** keep their routes, cache key, 6h TTL and `'projections'` tag; only the response body shape changes.
- **`useForecastSnapshots` / IndexedDB** — stored snapshots embed a full `ProjectionData`, so v1 records are structurally incompatible with the new renderer.
- **`ForecastContextPanel`** reads `confidence`, `reasoning`, `generatedAt`, `service`, `model` — all retained, so it needs no change.
- **Mock mode** — `NEXT_PUBLIC_USE_MOCK_DATA` paths in both the projections route and `src/data/historicalPrices.ts` must be updated together; a stale mock is the most likely way this ships looking broken in development.

### Potential Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| v1 snapshots in IndexedDB crash the chart (`hist` gone, scenarios are `number[]`) | **High** — any existing user has them | `useForecastSnapshots` filters out records whose `projection.schemaVersion !== 2` on read. Discard rather than migrate: a v1 snapshot has no anchor grid to reconstruct. |
| Model returns offsets that don't match the grid, or the wrong point count | Medium | Provider-side validation snaps to nearest grid offset; a coin missing any scenario is dropped from the response rather than half-rendered |
| Rescaling by `livePrice / currentPrice` distorts a forecast whose anchor was badly wrong | Medium | Shape is preserved (multiplicative, not additive). If the ratio falls outside a sane band (e.g. >2× or <0.5×), the forecast is treated as unusable and the panel shows history plus the stale warning rather than a fabricated curve — AC 2.10's "never displays invented prices" |
| CoinGecko 429 on the 365-day fetch | Medium | 1h `revalidate` already caches server-side; `keepPreviousData` holds the last good series; stale banner + Retry surfaces it honestly |
| Pinned-axis overlay drifts out of alignment with the scrolling plot | Medium | Both charts are fed the identical `yDomain` and identical top/bottom margins; the overlay renders no plot area of its own |
| 365 history points + 57 forecast points re-rendering on every 60s price poll | Low | `buildChartRows` / `computeYDomain` memoised on `[coin, histRange, fcastRange, historyData, projection]`; the live price enters only via the anchor factor and the join row |
| Scroll container swallowing vertical page scroll on trackpads | Low | `overflow-y: hidden` on the scroll container confines it to the horizontal axis |
| Forecast grid dates drifting as `generatedAt` ages against a 6h cache | Low | Offsets are resolved against `generatedAt`, not "now", so a cached forecast's points keep their true calendar dates |

---

## 4. Testing Strategy

Automated tests are **out of scope for this spec** (per instruction; no test runner is configured in the project). Verification is by type-check plus manual walkthrough:

- `npx tsc --noEmit` — the `ProjectionData` v2 change is deliberately breaking, so the compiler enumerates every call site that must be updated.
- Manual pass per coin (BTC/ETH/SOL) against a public price source: headline matches live price; final history point meets the headline; axis shows real coin-appropriate levels, never `$0K`; all three scenarios start at the headline price.
- Manual pass on the range control: each side remembers its own range across toggle flips; both halves stay drawn; 1Y history scrolls with the axis pinned; 1W fits without a scrollbar.
- Manual pass on failure behaviour: with the network throttled/offline, the chart keeps the last data, shows the stale warning with an age, and clears it on a successful Retry.
- Mock-mode pass with `NEXT_PUBLIC_USE_MOCK_DATA=true` to confirm both mock paths were updated together.

`src/lib/projectionSeries.ts` is deliberately pure and side-effect free so that unit tests can be added later without touching component code.
