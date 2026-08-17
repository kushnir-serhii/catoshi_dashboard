# Technical Specification: Asset List with Live Sparklines

- **Functional Specification:** [context/spec/006-asset-list-live-sparklines/functional-spec.md](../functional-spec.md)
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

A new `/api/markets` Route Handler will call CoinGecko's `/coins/markets` endpoint — the single CoinGecko call that returns all needed fields in one response: price, 24h change, market cap, volume, and a 7-day sparkline prices array. A new `useMarkets` SWR hook will poll this route on the existing 60-second interval and expose the same `isLoading`/`isStale`/`countdown` interface as `usePrices`. The Markets page's live table section will be wired to this hook, replacing mock values with real data. A new `SparklineChart` component (small Recharts `LineChart`, no axes or grid) replaces the existing hand-rolled SVG sparkline. Client-side sorting is handled with a single piece of React state.

**Affected files:**
- New: `src/app/api/markets/route.ts`
- New: `src/hooks/useMarkets.ts`
- New: `src/components/dashboard/SparklineChart.tsx`
- Modified: `src/components/pages/MarketsPage.tsx`
- Modified: `src/data/markets.ts` (mock shape update)
- Modified: `src/consts/prices.ts` (one new constant)

---

## 2. Proposed Solution & Implementation Plan

### 2.1 New Type: `MarketListItem`

Defined in `src/lib/marketData.ts` (alongside the existing `PriceMap` and `HistoricalPrice` types).

| Field | Type | Source |
|---|---|---|
| `id` | `string` | CoinGecko coin ID |
| `symbol` | `string` | Ticker symbol |
| `name` | `string` | Display name |
| `image` | `string` | Logo URL |
| `current_price` | `number` | USD price |
| `price_change_percentage_24h` | `number` | 24h % change |
| `market_cap` | `number` | Total market cap (USD) |
| `total_volume` | `number` | 24h volume (USD) |
| `sparkline_in_7d` | `{ price: number[] }` | ~168 hourly price points |

---

### 2.2 New Route Handler: `GET /api/markets`

**File:** `src/app/api/markets/route.ts`

**CoinGecko call:**
```
GET /coins/markets
  ?vs_currency=usd
  &order=market_cap_desc
  &per_page=10
  &page=1
  &sparkline=true
  &price_change_percentage=24h
```

- **Next.js cache TTL:** `revalidate = 60` — same as `/api/prices`.
- **Response shape:** `MarketListItem[]` — the CoinGecko response fields map directly; no transformation needed beyond picking the fields defined in the type above.
- **Mock guard:** When `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, return the mock array from `src/data/markets.ts` shaped as `MarketListItem[]` (see §2.5).
- **Error handling:** Return HTTP 502 with `{ error: string }` if CoinGecko fails, matching the pattern in `/api/prices`.

---

### 2.3 New SWR Hook: `useMarkets`

**File:** `src/hooks/useMarkets.ts`

Mirrors the `usePrices` hook exactly in structure.

| Return value | Type | Behaviour |
|---|---|---|
| `assets` | `MarketListItem[] \| null` | SWR data; `null` on first load |
| `isLoading` | `boolean` | `swrLoading && !data` |
| `isStale` | `boolean` | `!!error && !!data` |
| `countdown` | `number` | 60→0 timer, resets on each successful fetch |

- **Polling interval:** `PRICES_REFRESH_INTERVAL_MS` from `src/consts/prices.ts` (60 000 ms).
- **SWR options:** `keepPreviousData: true`, `refreshInterval: PRICES_REFRESH_INTERVAL_MS`.

---

### 2.4 New Component: `SparklineChart`

**File:** `src/components/dashboard/SparklineChart.tsx`

A minimal Recharts `LineChart` rendered inside a fixed-height container.

| Prop | Type | Notes |
|---|---|---|
| `prices` | `number[]` | The `sparkline_in_7d.price` array (~168 points) |
| `isPositive` | `boolean` | `true` if `prices[last] > prices[0]`; drives color |

- **Color:** `#22c55e` (Tailwind `green-500`) when `isPositive`, `#ef4444` (`red-500`) when not — matching the 24h change colour convention.
- **Recharts config:** `LineChart` with one `Line`, no `XAxis`, no `YAxis`, no `CartesianGrid`, no `Tooltip`, no `dot`. Wrapped in `ResponsiveContainer` with `height={40}`.
- **Performance:** Decorations stripped to the minimum; `isAnimationActive={false}` on the `Line` to avoid 10 simultaneous entrance animations.

---

### 2.5 Mock Data Update: `src/data/markets.ts`

The existing `MarketAsset` type has a `spark: number` (integer seed) field. This must change to `sparkline: number[]` to match `MarketListItem` and allow mock mode to render the real `SparklineChart` component without special-casing.

- Replace `spark: number` with `sparkline: number[]` in the type and each mock row.
- Each mock sparkline can be a short static array (e.g. 7 weekly close approximations) — it only needs to be non-empty and plausibly shaped.
- Update any references to the old `spark` field in `MarketsPage.tsx`.

---

### 2.6 Constants: `src/consts/prices.ts`

Add one constant:

```
MARKETS_PAGE_SIZE = 10
```

Used in the Route Handler's `per_page` query parameter. Keeps the "top 10" rule out of the handler's inline logic.

---

### 2.7 Markets Page Changes: `src/components/pages/MarketsPage.tsx`

**Within `<LiveMarketsContent>`:**

1. **Add `useMarkets()`** alongside (not replacing) `usePrices()`. The KPI cards above the table continue to use `usePrices`; the table rows switch to `useMarkets`.
2. **Populate all table columns** from `assets: MarketListItem[]`: price, 24h change, market cap, volume, and sparkline — no more mock values for any column.
3. **Skeleton rows:** Extend `SkeletonCell` to all 6 columns (currently only Price and 24h use it). Show 10 skeleton rows when `isLoading === true`.
4. **Stale warning:** Show `<span style={{ color: 'var(--warning)' }}>Data may be outdated</span>` below the table when `isStale === true` — same markup as the KPI footer.
5. **Sorting state:** `useState<{ key: keyof MarketListItem; dir: 'asc' | 'desc' }>` initialised to `{ key: 'market_cap', dir: 'desc' }`. Sort the `assets` array before mapping to rows. Column headers gain an `onClick` handler and display a `▲`/`▼` indicator on the active column.
6. **SparklineChart:** Replace `<Sparkline seed={a.spark} />` with `<SparklineChart prices={a.sparkline_in_7d.price} isPositive={...} />`.

---

## 3. Impact and Risk Analysis

### System Dependencies

- `useMarkets` and `usePrices` both run on the Markets page simultaneously. This means two `/api/*` calls per 60-second interval from the same page. Acceptable for now; a future optimisation could feed KPI cards from `useMarkets` and retire the separate `usePrices` call on this page.
- Vercel's free-tier edge cache is the key rate-limit protection. The `/api/markets` route handler's 60s `revalidate` means Vercel serves a cached response to all clients within any 60-second window — only one upstream CoinGecko call per minute regardless of visitor count.

### Potential Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| CoinGecko public API rate limit (30 req/min) exceeded | Low | Vercel edge cache with `revalidate: 60` means ≤1 upstream call/min |
| Sparkline data absent (CoinGecko returns empty array) | Low | `SparklineChart` renders nothing on empty array; no crash |
| 10 Recharts `LineChart` instances hurting initial render | Medium | `isAnimationActive={false}`, stripped decorations, and `height={40}` keeps each instance minimal |
| `MarketAsset` type change (`spark` → `sparkline`) breaking mock mode | Low | Field only referenced in `markets.ts` and `MarketsPage.tsx`; TypeScript surfaces all stale references at compile time |
| CoinGecko `sparkline_in_7d` unavailable on free tier | Very low | Field is available on the public (no-key) API when `sparkline=true` is passed |

---

## 4. Testing Strategy

- **Route Handler (`/api/markets`):** Verify the correct CoinGecko URL is constructed (including `sparkline=true`, `per_page=10`, `order=market_cap_desc`). Verify the mock guard returns a `MarketListItem[]`-shaped response. Verify a CoinGecko failure returns HTTP 502.
- **`useMarkets` hook:** Verify 60s polling interval; `isStale` is true when data exists but the last fetch errored; `isLoading` is false once first data arrives; `countdown` resets to 60 on each successful fetch.
- **`SparklineChart`:** Verify line colour is green when `isPositive=true` and red when `isPositive=false`. Verify it renders without crashing on an empty `prices` array.
- **Table sorting:** Clicking a column header sorts ascending; clicking again sorts descending; the `▲`/`▼` indicator reflects the current direction; default order is market cap descending.
- **Stale warning:** Visible when `isStale=true`; hidden when `isStale=false`.
- **Mock mode:** `NEXT_PUBLIC_USE_MOCK_DATA=true` renders the table with mock data — no network calls, no broken sparklines.
