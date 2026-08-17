# Technical Specification: Historical Price Chart

- **Functional Specification:** [context/spec/005-historical-price-chart/functional-spec.md](context/spec/005-historical-price-chart/functional-spec.md)
- **Status:** Completed
- **Author:** Serhii Kushnir

---

## 1. High-Level Technical Approach

Replace the placeholder chart on the main dashboard page with a real Recharts `AreaChart` component. The component fetches historical price data via a new internal Route Handler (`/api/prices/history`), which proxies CoinGecko's market chart endpoint with a 1-hour Data Cache TTL (no ISR — safe for Vercel free tier). A new SWR hook manages loading and error states client-side. Because the user can search any CoinGecko coin, a second cached Route Handler (`/api/coins/list`) provides the searchable coin list. The user's last-selected coin and time range are persisted to `localStorage`.

**Systems affected:** main dashboard page, new API routes, new SWR hooks, new chart component.

---

## 2. Proposed Solution & Implementation Plan

### 2.1 New Files

| Path | Responsibility |
|---|---|
| `src/app/api/prices/history/route.ts` | Route Handler — proxies CoinGecko `/coins/{id}/market_chart`, 1-hour Data Cache |
| `src/app/api/coins/list/route.ts` | Route Handler — proxies CoinGecko `/coins/list`, 24-hour Data Cache |
| `src/hooks/useHistoricalPrices.ts` | SWR hook — fetches `/api/prices/history?id=&days=`, no polling |
| `src/hooks/useCoinSearch.ts` | SWR hook + local filter — fetches `/api/coins/list`, local text search |
| `src/components/dashboard/HistoricalPriceChart.tsx` | Chart component (Recharts AreaChart + asset selector + range buttons) |
| `src/data/historicalPrices.ts` | Mock data — seeded historical price arrays for dev/CI (`NEXT_PUBLIC_USE_MOCK_DATA`) |

### 2.2 Modified Files

| Path | Change |
|---|---|
| `src/app/(admin)/page.tsx` | Replace placeholder chart with `<HistoricalPriceChart />` |
| `src/consts/prices.ts` | Add `HISTORY_CACHE_TTL_S = 3600`, `HISTORY_DAYS_OPTIONS = [7, 30, 90, 365]` |
| `src/data/types.ts` | Add `HistoricalPrice`, `HistoricalPricesResponse`, `CoinListItem` types |

### 2.3 API Contracts

**`GET /api/prices/history`**
- Query params: `id` (CoinGecko coin ID, e.g. `bitcoin`), `days` (7 | 30 | 90 | 365)
- External call: `GET https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days={days}&interval=daily`
- Data Cache: `fetch(..., { next: { revalidate: 3600 } })`
- Response shape: `{ prices: { timestamp: number; price: number }[] }`
- Error: `{ error: string }` with appropriate HTTP status

**`GET /api/coins/list`**
- No query params
- External call: `GET https://api.coingecko.com/api/v3/coins/list`
- Data Cache: `fetch(..., { next: { revalidate: 86400 } })` (24 hours)
- Response shape: `{ coins: { id: string; symbol: string; name: string }[] }`

### 2.4 Component Breakdown

**`HistoricalPriceChart`**
- Local state: `selectedCoinId` (string), `selectedDays` (number), `searchQuery` (string)
- On mount: reads `catoshi:chart-prefs` from `localStorage`; defaults to `{ coinId: 'bitcoin', days: 30 }` on first visit
- On `selectedCoinId` or `selectedDays` change: writes to `localStorage`
- Renders:
  - **Coin search input** — text input, filters `useCoinSearch` results; selecting a coin sets `selectedCoinId`
  - **Range buttons** — four buttons (7D / 30D / 90D / 1Y); active one is visually highlighted
  - **Recharts `AreaChart`** inside `ResponsiveContainer` — matches existing OKLCh colour palette and margin conventions from `charts.tsx`
  - **Skeleton** — shown while `isLoading` is true (same size as chart area, no layout shift)
  - **Error state** — shown when `error` is set and `data` is undefined; includes a Retry button that calls SWR's `mutate()`
  - **Tooltip** — custom `ChartTooltip` showing formatted USD price and date (follows existing `ChartTooltip` pattern in `charts.tsx`)

### 2.5 Data Shape

CoinGecko returns `prices` as `[timestamp_ms, price_usd]` tuple arrays. The Route Handler normalises this to `{ timestamp: number; price: number }[]` before sending to the client.

### 2.6 LocalStorage Persistence

- Key: `catoshi:chart-prefs`
- Shape: `{ coinId: string; days: number }`
- Read: SSR-safe (guarded by `typeof window !== 'undefined'`), falls back to default on parse error
- Write: on every asset or range change, wrapped in try/catch (private-browsing quota tolerance)

### 2.7 Mock Data (Dev/CI)

When `NEXT_PUBLIC_USE_MOCK_DATA=true`, both Route Handlers return data from `src/data/historicalPrices.ts` without calling CoinGecko. Mock data uses a seeded RNG (same mulberry32 pattern as `charts.tsx`) to produce reproducible price series per coin.

---

## 3. Impact and Risk Analysis

**System Dependencies**
- CoinGecko public API — no key required, but subject to rate limits (~30 req/min on free tier). With a 1-hour Data Cache, each unique `[coinId, days]` pair generates at most 1 upstream call per hour per server instance. Free coin search adds unbounded coin IDs, but in practice users will query a small set.
- `src/app/(admin)/page.tsx` — only the placeholder chart element is replaced; surrounding layout is untouched.

**Potential Risks & Mitigations**

| Risk | Mitigation |
|---|---|
| CoinGecko rate limit hit (especially with free coin search generating many unique cache keys) | 1-hour Data Cache minimises calls. Add a `429` handler in the Route Handler that returns a user-visible error so the Retry button works correctly. |
| `/api/coins/list` returns ~15,000 coins — large payload | Cache for 24 hours; filter purely client-side on the already-fetched list. Never re-fetch on each keystroke. |
| `localStorage` unavailable (SSR / private browsing) | All reads/writes are wrapped in `typeof window` guards and try/catch. |
| Chart layout shift during skeleton-to-chart transition | `ResponsiveContainer` and skeleton share identical `height` CSS; the outer wrapper has a fixed height. |

---

## 4. Testing Strategy

- **Mock data toggle:** With `NEXT_PUBLIC_USE_MOCK_DATA=true`, all Route Handlers return deterministic seeded data. The chart component can be visually verified in this mode without hitting CoinGecko.
- **Unit tests (if added):** The timestamp→`{ timestamp, price }` normalisation function in the Route Handler is a pure function and is straightforward to unit test.
- **Manual QA against functional spec acceptance criteria:** All criteria in the functional spec are manually verifiable in the browser — asset switch, range switch, tooltip, skeleton, error/retry, first-visit default, persisted selection.
- **Error state:** Temporarily set `NEXT_PUBLIC_USE_MOCK_DATA=false` and disable network in DevTools to trigger and verify the error + Retry flow.
