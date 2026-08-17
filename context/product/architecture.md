# System Architecture Overview: Catoshi

---

## 1. Application & Technology Stack

- **Framework:** Next.js 16 (App Router) — full-stack React framework; Route Handlers serve as the server-side API proxy layer.
- **Language:** TypeScript — strict typing across all frontend and API code.
- **UI Library:** React 19 — component model for all dashboard pages and panels.
- **Styling:** Tailwind CSS v4 + custom CSS variables for theming (dark mode, brand colours).
- **Client-Side Data Fetching:** SWR — lightweight polling with deduplication, stale-while-revalidate, and `keepPreviousData` for smooth updates.
- **Charts:** Recharts — used for portfolio and projection charts.

---

## 2. Data Fetching & Caching

- **Server-Side Proxy:** All external API calls are made from Next.js Route Handlers (`/app/api/*`), never directly from client components. This protects rate limits and centralises caching.
- **Next.js Fetch Cache:** Route Handlers use Next.js `fetch` with `revalidate` TTLs — prices: 60s, historical charts: 3600s (1 hour), coin list: 86400s (24 hours), news/signals: 120s.
- **Projections ISR (6h):** The `/api/projections` Route Handler wraps its AI forecast call in `unstable_cache` with a 6-hour TTL and the tag `'projections'`. On-demand revalidation is triggered by calling `revalidateTag('projections')` (e.g. from a manual refresh action), bypassing the TTL without a full deploy.
- **Client Polling:** SWR hooks in client components poll the internal Route Handlers on a 60-second interval. No external API is ever called from the browser. Historical price data (`/api/prices/history`) and the coin list (`/api/coins/list`) use no polling — fetched once per session and cached.
- **Historical Price Chart:** The `HistoricalPriceChart` component lives on the **Markets page** (not a standalone home dashboard). It fetches from `/api/prices/history?id=&days=` via SWR with no polling; the coin search dropdown fetches `/api/coins/list` once and filters client-side.
- **Real-Time Streaming:** Binance WebSocket (`wss://stream.binance.com`) used exclusively for the live price ticker on the main chart. Native browser WebSocket API — connect on mount, disconnect on unmount, auto-reconnect on drop.
- **Mock Data Toggle:** `NEXT_PUBLIC_USE_MOCK_DATA=true` env flag bypasses all API calls and falls back to static TypeScript mock data in `/src/data/`. Used during development and CI.

---

## 3. External Data Sources & APIs

- **Market Prices & Metadata:** CoinGecko public API (`https://api.coingecko.com/api/v3`) — no API key required. Provides prices, 24h change, volume, market cap, coin metadata, historical price data (`/coins/{id}/market_chart`), and the full searchable coin list (`/coins/list`).
- **Live Price Ticker:** Binance WebSocket (`wss://stream.binance.com:9443/ws`) — no API key required. Used for BTC, ETH, SOL live tickers on the main chart only.
- **News & Signals:** CryptoPanic free-tier API (`https://cryptopanic.com/api/v1/posts/`) — requires a free API key. Provides news articles tagged as bullish/bearish/neutral for signal cards.
- **Fear & Greed Index:** Alternative.me public API (`https://api.alternative.me/fng/`) — no API key required. Returns the current Crypto Fear & Greed score (0–100) and classification, used as a sentiment input for forecast context.
- **Reddit Sentiment:** Reddit public JSON API (e.g. `https://www.reddit.com/r/CryptoCurrency.json`) — no API key required for read-only public posts. Provides post titles and scores as an additional unstructured sentiment signal fed into the AI forecast prompt.
- **RSS-to-JSON Bridge:** `rss2json.com` API — converts any public RSS/Atom feed to JSON. Used to pull additional crypto news sources not covered by CryptoPanic, with no server-side RSS parsing dependency.

---

## 4. Infrastructure & Deployment

- **Hosting:** Vercel — zero-config Next.js deployment with automatic preview environments per branch, edge caching for Route Handlers, and instant rollbacks.
- **Environment Variables:** Managed via Vercel project settings (production/preview/development). Sensitive keys (e.g. CryptoPanic API key) stored as server-only env vars; public flags (e.g. `NEXT_PUBLIC_USE_MOCK_DATA`) stored as public env vars.
- **CI/CD:** Vercel Git integration — every push to `main` triggers a production deploy; every PR gets a preview URL.

---

## 5. Observability & Monitoring

- **Web Analytics:** Vercel Analytics — page view tracking and visitor insights, zero configuration.
- **Performance Monitoring:** Vercel Speed Insights — Core Web Vitals tracking per page, highlights regressions automatically.

---

## 6. AI Providers (`src/lib/forecast/`)

All AI forecast generation runs server-side inside Route Handlers — no AI SDK is ever imported in client components.

- **Anthropic SDK (Claude):** Used for structured forecast generation via tool-use calls. The model is instructed to call a defined `generate_forecast` tool, guaranteeing a typed JSON payload. Configured in `src/lib/forecast/anthropic.ts`.
- **OpenAI SDK:** Used via JSON output mode (`response_format: { type: "json_object" }`). Serves as an alternative provider or fallback. Configured in `src/lib/forecast/openai.ts`.
- **Provider Abstraction:** `src/lib/forecastProvider.ts` exports a single `generateForecast(input)` function that routes to the active provider based on the `FORECAST_PROVIDER` env var (`anthropic` | `openai`). Both providers return the same `ForecastResult` TypeScript type, making them interchangeable at the call site.
- **Environment Variables:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `FORECAST_PROVIDER` are stored as server-only env vars in Vercel project settings, never exposed to the client bundle.

---

## 7. Browser-Side Persistence

Client-side state that must survive page reloads or browser restarts is stored in two browser APIs:

- **`localStorage` — Forecast Settings:** Key `catoshi:forecast-settings` stores the user's forecast UI preferences as a JSON string (selected provider, time horizon, confidence display threshold, pinned assets). Read on component mount; written on any setting change. Cleared if the stored schema version mismatches.
- **`localStorage` — Chart Preferences:** Key `catoshi:chart-prefs` stores the user's last-selected asset and time range for the Historical Price Chart as a JSON string (`{ coinId: string; days: number }`). Read on mount via a lazy initializer (SSR-safe); written on every selection change. Defaults to `{ coinId: "bitcoin", days: 30 }` on first visit.
- **`IndexedDB` — Forecast Snapshots:** Database `catoshi-db`, object store `catoshi-snapshots`. Holds up to 5 named forecast snapshots — each snapshot contains the full `ForecastResult` payload, a user-provided label, and a timestamp. When the limit is reached, the oldest snapshot is evicted. Accessed via a thin async wrapper in `src/lib/snapshotStore.ts` (no external IndexedDB library required).
