# System Architecture Overview: Catoshi

_Revised 02.09.2026. Reflects the narrowed scope in `product-definition.md` §3.2 —
forecasting and signals only, no portfolio, wallet, account or personal data. Sections
marked **planned** describe systems a spec exists for but which are not yet built; they are
labelled so nobody reads them as a description of shipped code._

---

## 1. Application & Technology Stack

- **Framework:** Next.js 16 (App Router) — full-stack React framework; Route Handlers serve as the server-side API proxy layer.
- **Language:** TypeScript — strict typing across all frontend and API code.
- **UI Library:** React 19 — component model for all dashboard pages and panels.
- **Styling:** Tailwind CSS v4 + custom CSS variables for theming (dark mode, brand colours).
- **Client-Side Data Fetching:** SWR — lightweight polling with deduplication, stale-while-revalidate, and `keepPreviousData` for smooth updates.
- **Charts:** Recharts — used for the projection and historical price charts.

---

## 2. Data Fetching & Caching

- **Server-Side Proxy:** All external API calls are made from Next.js Route Handlers (`/app/api/*`), never directly from client components. This protects rate limits and centralises caching.
- **Next.js Fetch Cache:** Route Handlers use Next.js `fetch` with `revalidate` TTLs — prices: 60s, historical charts: 3600s (1 hour), coin list: 86400s (24 hours). `/api/signals` is `dynamic = 'force-dynamic'` (not cached) and the client polls (spec 014).
- **Projections ISR (6h):** The `/api/projections` Route Handler wraps its AI forecast call in `unstable_cache` with a 6-hour TTL and the tag `'projections'`. On-demand revalidation is triggered by calling `revalidateTag('projections')` (e.g. from a manual refresh action), bypassing the TTL without a full deploy.
- **Client Polling:** SWR hooks in client components poll the internal Route Handlers on a 60-second interval. No external API is ever called from the browser. Historical price data (`/api/prices/history`) and the coin list (`/api/coins/list`) use no polling — fetched once per session and cached.
- **Historical Price Chart:** The `HistoricalPriceChart` component lives on the **Markets page** (not a standalone home dashboard). It fetches from `/api/prices/history?id=&days=` via SWR with no polling; the coin search dropdown fetches `/api/coins/list` once and filters client-side.
- **Real-Time Streaming:** Binance WebSocket (`wss://stream.binance.com`) used exclusively for the live price ticker on the main chart. Native browser WebSocket API — connect on mount, disconnect on unmount, auto-reconnect on drop.
- **Mock Data Toggle:** `NEXT_PUBLIC_USE_MOCK_DATA=true` env flag bypasses all API calls and falls back to static TypeScript mock data in `/src/data/`. Used during development and CI.

---

## 3. External Data Sources & APIs

- **Market Prices & Metadata:** CoinGecko public API (`https://api.coingecko.com/api/v3`) — no API key required. Provides prices, 24h change, volume, market cap, coin metadata, historical price data (`/coins/{id}/market_chart`), and the full searchable coin list (`/coins/list`).
- **Live Price Ticker:** Binance WebSocket (`wss://stream.binance.com:9443/ws`) — no API key required. Used for BTC, ETH, SOL live tickers on the main chart only.
- **Signals:** The Signals feed is generated in-house from the market-state snapshot store — no external API. Deterministic rules in `src/lib/signals/rules/` run over each hourly snapshot inside the `/api/collect` run and persist to `public.signals`; `/api/signals` only reads stored rows (spec 014). News-sourced, LLM-classified signals (the original spec 002 design) were never built and are scoped to a later spec.
- **News (forecast context only):** No CryptoPanic integration ships in code — `CRYPTOPANIC_API_KEY` still exists in `.env.example` but no path in `src/lib/` calls the CryptoPanic API (verified against `src/lib/marketData.ts`; corrected here, spec 010 Slice 7). The actual news input is the RSS-to-JSON bridge below, combined with Reddit sentiment, and it feeds the forecast prompt — not the Signals feed.
- **Fear & Greed Index:** Alternative.me public API (`https://api.alternative.me/fng/`) — no API key required. Returns the current Crypto Fear & Greed score (0–100) and classification, used as a sentiment input for forecast context.
- **Reddit Sentiment:** Reddit public JSON API (e.g. `https://www.reddit.com/r/CryptoCurrency.json`) — no API key required for read-only public posts. Provides post titles and scores as an additional unstructured sentiment signal fed into the AI forecast prompt.
- **RSS-to-JSON Bridge:** `rss2json.com` API — converts public crypto RSS/Atom feeds to JSON, with no server-side RSS parsing dependency. This is the actual news source fed into the forecast prompt via `src/lib/marketData.ts`. **Planned (spec 015):** the same bridge becomes the input to the news impact classifier, which persists classified items as signals rather than only injecting headlines into a prompt.

### 3.1 Route Handlers

| Route | Purpose | Auth |
|---|---|---|
| `/api/prices`, `/api/prices/history`, `/api/coins/list`, `/api/markets` | CoinGecko proxies | none |
| `/api/projections`, `/api/projections/refresh` | Forecast generation, 6 h `unstable_cache`, tag `projections` | none |
| `/api/signals` | Reads stored signal rows only — never computes, never calls an external API | none |
| `/api/collect` | Hourly collection: snapshot build + upsert, then signal generation, then forecast resolution + scoring (spec 011) | `Authorization: Bearer CRON_SECRET` |
| `/api/models` | Serves measured calibration aggregates, read straight from the `calibration_*` views — no computation (spec 011) | none |

---

## 4. Infrastructure & Deployment

- **Hosting:** Vercel — zero-config Next.js deployment with automatic preview environments per branch, edge caching for Route Handlers, and instant rollbacks.
- **Environment Variables:** Managed via Vercel project settings (production/preview/development). Sensitive keys (e.g. `DATABASE_URL`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) stored as server-only env vars; public flags (e.g. `NEXT_PUBLIC_USE_MOCK_DATA`) stored as public env vars.
- **CI/CD:** Vercel Git integration — every push to `main` triggers a production deploy; every PR gets a preview URL.
- **Scheduled Collection:** GitHub Actions (`.github/workflows/collect.yml`) calls `/api/collect` hourly with a bearer-token secret (spec 010) — the primary scheduler, since Vercel Hobby cron is daily-only. A daily `vercel.json` cron hits the same endpoint as a fallback if the Actions schedule ever lapses (GitHub disables scheduled workflows after 60 days of repo inactivity).

---

## 5. Observability & Monitoring

- **Web Analytics:** Vercel Analytics — page view tracking and visitor insights, zero configuration.
- **Performance Monitoring:** Vercel Speed Insights — Core Web Vitals tracking per page, highlights regressions automatically.

---

## 6. AI Providers (`src/lib/forecast/`)

All AI forecast generation runs server-side inside Route Handlers — no AI SDK is ever imported in client components.

- **Anthropic SDK (Claude):** Used for structured forecast generation via tool-use calls. The model is instructed to call a defined tool, guaranteeing a typed JSON payload. Configured in `src/lib/forecast/claude.ts` (corrected here, spec 010 Slice 7 — previously documented as `anthropic.ts`, which does not exist).
- **OpenAI SDK:** Used via JSON output mode (`response_format: { type: "json_object" }`). Serves as an alternative provider. Configured in `src/lib/forecast/openai.ts`.
- **Provider Abstraction:** `src/lib/forecastProvider.ts` exports `generateForecast(service, model, marketData, targets)`, which validates the `{ service, model }` pair against an allowlist and routes to `generateClaudeForecast` or `generateOpenAIForecast`, both returning the shared `ForecastGenerationResult` type (`src/data/types.ts`) — not a per-request `FORECAST_PROVIDER` env var; the service/model choice is a call-site parameter, persisted per-user via `localStorage` (see §8). Corrected here, spec 010 Slice 7.
- **Environment Variables:** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are stored as server-only env vars in Vercel project settings, never exposed to the client bundle. There is no `FORECAST_PROVIDER` env var.

---

## 7. Data Persistence (spec 010)

- **Database:** Neon Postgres (serverless, scale-to-zero), chosen over Supabase for per-project quotas and idle behaviour that doesn't pause the database (see `context/spec/010-market-snapshot-store/technical-considerations.md` §2.1). Accessed server-only via a pooled `pg.Pool` singleton in `src/lib/db/client.ts` (`DATABASE_URL`, host contains `-pooler`); migrations run against the unpooled `DATABASE_URL_UNPOOLED` (`scripts/migrate.mjs`), since DDL needs a session-level connection the pooler mishandles.
- **Tables** (`db/migrations/0001_analytics.sql`):
  - `assets` — symbol ↔ Binance pair ↔ CoinGecko id, seeded with BTC/ETH/SOL.
  - `snapshots` — one row per asset per hour (`UNIQUE (asset_id, ts)`, upserted), typed indicator/derivative/flow columns plus a `raw jsonb` catch-all.
  - `forecasts` — one row per forecast generation (never upserted), FK to `snapshots`, with `model`, `prompt_version`, and token/cost columns.
  - `outcomes` — created empty here, filled by a later spec; `UNIQUE (forecast_id)`.
- **Write paths:** `/api/collect` (Route Handler, `Authorization: Bearer CRON_SECRET`) builds and upserts one snapshot per tracked asset via `src/lib/snapshotBuilder.ts` + `src/lib/db/analytics.ts`. `/api/projections` persists each forecast generation fire-and-forget from inside its `unstable_cache` callback, so a database hiccup never degrades the dashboard response.
- **Scheduling:** see §4's Scheduled Collection entry.

## 7.1 Signal Layer (spec 014, shipped)

- **Pure rules.** `src/lib/signals/rules/*` are `(snapshot, previous) => Signal | null`
  functions, one per rule, registered in `rules/index.ts`. 16 rules, 473 unit tests
  (`src/scripts/signal-rules.test.ts`), verified by mutation.
- **Generation runs inside collection.** `src/lib/signals/generate.ts` runs every rule over
  each freshly committed snapshot inside the `/api/collect` run and upserts `public.signals`
  — idempotent per hour, with `since_ts` carry-forward so a persisting condition keeps its
  original onset time.
- **Read path is dumb by design.** `/api/signals` selects stored rows. It computes nothing,
  calls nothing, and has no mock fallback. If collection is dead, the feed shows its true age.

## 7.2 News Impact Classification (spec 015, planned)

- Headlines arrive from the existing RSS-to-JSON bridge, are de-duplicated by URL hash, and
  are classified in batches by a cheap model tier (Claude Haiku) using structured tool-use
  output — never free text.
- Each classified item is stored in `news_items` and emitted into the same `public.signals`
  table with `kind = 'news'`, carrying: **scope** (`market` or a specific tracked asset),
  direction, magnitude, horizon, confidence, `prompt_version`, and the source URL.
- Because each item stores an asserted direction and horizon, news signals are resolvable
  by the same scoring machinery as forecasts (spec 011). A news signal that cannot be scored
  is an opinion, and this product does not ship unfalsifiable opinions as data.

## 7.3 Scoring & Calibration (spec 011, shipped)

- **Forecast shape.** Each forecast persists its three scenario price curves (`bull`, `base`,
  `bear`) and the scenario probability map in `forecasts.scenarios`. The curves are what a
  horizon price is later looked up against; the probabilities are what the Brier score grades.
- **Pure maths.** `src/lib/scoring/` holds I/O-free, unit-tested functions: `brier.ts`
  (multi-category Brier, `BS = Σ(pᵢ − oᵢ)²` over `{bull, base, bear}`, range 0..2),
  `realizedScenario.ts` (the midpoint-partition rule below), `resolve.ts` (the resolver).
  Tests: `src/scripts/scoring.test.ts`, run with `npx tsx`. Constants: `src/consts/scoring.ts`.
- **Resolution runs inside collection.** `resolveForecasts()` is called from `/api/collect`
  after snapshots commit — the same placement and isolation as signal generation. It finds
  every `(forecast, horizon)` pair whose `as_of + horizon_days` has elapsed with no outcome
  row, looks up the real market price at the horizon (linked snapshot first, CoinGecko daily
  close as fallback), decides the realized scenario, and writes `public.outcomes` with a
  stored `brier_score`. The score is `NULL` when the outcome is unscoreable (degenerate curve,
  rejected probabilities, no market entry price) — **never `0`**. Every failure is caught,
  surfaced through `SourceStatus`, and never fails the collect run. Idempotent: a re-run of
  the same hour writes nothing new and never changes an existing score.
- **The realized-scenario rule is fixed in advance — canonical statement.** Sort the three
  predicted prices ascending (`bull > base > bear` is not assumed). Cut the axis at the
  midpoints between neighbours: above `midpoint(middle, highest)` → `bull`; below
  `midpoint(lowest, middle)` → `bear`; otherwise, **including a price exactly on either
  boundary** → `base`. Two equal predicted prices → unscoreable (`null`). **Changing this
  rule invalidates every stored score**, so it is stated here and in the doc-comment header of
  `src/lib/scoring/realizedScenario.ts`; those two must stay in step.
- **Calibration reads go through SQL views** (`db/migrations/0006_calibration_view.sql`).
  `calibration_base` is the single place the exclusions live — back-filled snapshots
  (`raw ->> 'backfill'`), `forecasts.snapshot_id is null`, and unscoreable outcomes are all
  set aside and counted there. `calibration_scores`, `calibration_trend` and
  `calibration_exclusions` aggregate it. New migrations for this spec:
  `0005_outcome_scores.sql` (adds `outcomes.brier_score` with a `[0, 2]` check),
  `0006_calibration_view.sql`.
- **`/api/models`** reads those views with no computation. `ModelsPage.tsx` (`src/hooks/useModels.ts`)
  shows mean Brier per `model` + `prompt_version` beside the 0.667 no-skill baseline, the
  month-over-month trend, the sample count and the exclusions, and an explicit
  insufficient-data state below `MIN_SCORED_SAMPLE_SIZE` (30). Aggregation is by
  `model` + `prompt_version`, always. The baseline is 0.667 (three mutually exclusive
  scenarios), not the binary 0.25 — see `decisions.md` §6.

## 8. Browser-Side Persistence

Client-side state that must survive page reloads or browser restarts is stored in two browser APIs:

- **`localStorage` — Forecast Settings:** Key `catoshi:forecast-settings` stores the user's forecast UI preferences as a JSON string (selected provider, time horizon, confidence display threshold, pinned assets). Read on component mount; written on any setting change. Cleared if the stored schema version mismatches.
- **`localStorage` — Chart Preferences:** Key `catoshi:chart-prefs` stores the user's last-selected asset and time range for the Historical Price Chart as a JSON string (`{ coinId: string; days: number }`). Read on mount via a lazy initializer (SSR-safe); written on every selection change. Defaults to `{ coinId: "bitcoin", days: 30 }` on first visit.
- **`IndexedDB` — Forecast Snapshots:** Database `catoshi-db`, object store `catoshi-snapshots`. Holds up to 5 named forecast snapshots — each snapshot contains the full `ForecastResult` payload, a user-provided label, and a timestamp. When the limit is reached, the oldest snapshot is evicted. Accessed via a thin async wrapper in `src/lib/snapshotStore.ts` (no external IndexedDB library required).
