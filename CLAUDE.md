# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (Next.js, http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier write
npm run format:check # Prettier check
npm run daily-analysis  # Run tsx src/scripts/daily-analysis.ts
```

No test runner is configured. Type-check with `npx tsc --noEmit`.

## Architecture

**Catoshi Dashboard** — a crypto analytics dashboard with AI-powered forecasting built on Next.js 16 App Router, React 19, TypeScript 5.9 (strict), Tailwind CSS v4.

### Route Structure

- `src/app/(admin)/` — protected dashboard layout group; `page.tsx` redirects to `/projections`
- `src/app/landing/` — public marketing page
- `src/app/api/` — Route Handlers acting as a server-side proxy layer for all external calls (CoinGecko, AI providers, Reddit, news RSS, fear/greed index). `GET /api/health` (spec 017) is the exception — read-only, unauthenticated, makes no external call: per-asset newest-snapshot age + 24h count and per-collector last-success from `public.collector_status`, returning HTTP 503 when the newest snapshot is older than `SNAPSHOT_STALE_MINUTES` so one URL can be watched by an external uptime checker.

The admin layout (`(admin)/layout.tsx`) wraps everything in `DashboardShell`. Pages live under `src/app/(admin)/projections/`, `markets/`, `signals/`, `models/`.

### Data Flow

```
UI Component
  → SWR hook (src/hooks/)
    → fetch /api/<route>  (Route Handler)
      → src/lib/<provider>.ts  (external API call)
```

All external API calls must go through Route Handlers — never call third-party APIs directly from client components.

### Key Directories

- **`src/lib/`** — server-side integrations: `coingecko.ts`, `marketData.ts` (aggregates news/fear-greed/Reddit), `forecastProvider.ts` (validates service+model, delegates to `forecast/claude.ts` or `forecast/openai.ts`), `db/client.ts`, `db/collectorStatus.ts` (spec 017: upserts `public.collector_status` after each collect run), `db/health.ts` (spec 017: the two cheap reads behind `/api/health`), `freshness.ts` (spec 017: pure `snapshotAgeMinutes` / `isSnapshotStale` / `newestTimestamp`, shared by `/api/health` and the UI staleness note), `scoring/` (spec 011: pure Brier + realized-scenario functions and the resolver, run from `/api/collect`)
- **`src/hooks/`** — SWR-based data hooks with polling: `usePrices.ts` (60s), `useSignals.ts`, `useProjections.ts`, `useMarkets.ts`, `useHistoricalPrices.ts`, `useCoinSearch.ts`, `useModels.ts` (calibration reads for the Models page). `useForecastSnapshots.ts` wraps IndexedDB (max 5 snapshots, graceful fallback for private browsing).
- **`src/data/types.ts`** — canonical TypeScript interfaces: `PriceMap`, `MarketAsset`, `ProjectionData`, `ForecastSnapshot`, `Signal`, `KpiItem`, `SignalItem`
- **`src/consts/`** — shared constants only (see memory rule). `prices.ts` holds `DEFAULT_ASSET_IDS`, refresh intervals, cache TTLs. `signals.ts` holds `TRACKED_COINS` (aligned with the collected assets: BTC, ETH, SOL), rule thresholds, the freshness window, `SIGNALS_COUNT`, and revalidation/refresh intervals. `scoring.ts` holds the scored horizons, the `0.667` no-skill Brier baseline, `MIN_SCORED_SAMPLE_SIZE` (30) and the probability/price tolerances (spec 011). `collect.ts` holds the collector asset/timeframe/indicator constants and `SNAPSHOT_STALE_MINUTES` (90, spec 017 — one threshold shared by `/api/health` and the UI freshness note).
- **`src/lib/signals/`** — the market-state signal layer (spec 014): `rules/*` are pure `(snapshot, previous) => Signal | null` functions (one per rule, registered in `rules/index.ts`), `generate.ts` runs them over each freshly-committed snapshot inside the `/api/collect` run and upserts `public.signals` (idempotent per hour, with `since_ts` carry-forward). `/api/signals` only reads stored rows — it never computes indicators or calls an external API.
- **`src/components/dashboard/`** — dashboard UI: `charts.tsx` (Recharts `ProjectionChart`, SVG `Sparkline`), `context.tsx` (glow CSS variable), `DashboardShell.tsx`, `ForecastContextPanel.tsx`, `ForecastSettingsModal.tsx`, `HistoricalPriceChart.tsx`

### AI Forecast Layer

`src/lib/forecastProvider.ts` validates `{ service, model }` pairs and delegates:
- Claude models (via `@anthropic-ai/sdk`): `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-8`
- OpenAI models: `gpt-4o-mini`, `gpt-4o`

Signals are **not** LLM-generated. They come from the deterministic rule layer in
`src/lib/signals/` over the market-state snapshot store (spec 014). News-sourced,
LLM-classified signals (the original spec 002 design) remain unbuilt and are scoped to a
later spec.

### Forecast Scoring (spec 011)

Forecasts persist their three scenario price curves and probabilities in
`forecasts.scenarios`. `src/lib/scoring/` holds pure, tested functions — `brier.ts`
(multi-category Brier, `BS = Σ(pᵢ − oᵢ)²`, range 0..2), `realizedScenario.ts` (the
midpoint-partition rule: sort the three predicted prices, cut at the midpoints between
neighbours, a price exactly on a boundary → `base`, two equal predictions → unscoreable),
and `resolve.ts` (the resolver). Tests: `src/scripts/scoring.test.ts` (`npx tsx`).

Resolution runs inside the hourly `/api/collect` pass after snapshots commit — non-fatal,
surfaced via `SourceStatus`. It scores every forecast whose `as_of + horizon_days` has
elapsed against the real market price at the horizon, writing `public.outcomes.brier_score`
(NULL when unscoreable, never 0). Calibration reads go through the `public.calibration_*`
SQL views (migration `0006`), which centralise the exclusions (back-filled snapshots,
`snapshot_id is null`, unscoreable). `/api/models` reads those views with no computation;
`ModelsPage.tsx` shows mean Brier per model + prompt version beside the 0.667 no-skill
baseline (three mutually exclusive scenarios, **not** the binary 0.25), with an
insufficient-data state below `MIN_SCORED_SAMPLE_SIZE` (30). New migrations:
`db/migrations/0005_outcome_scores.sql`, `0006_calibration_view.sql`. The realized-scenario
rule is canonically documented in `context/product/architecture.md` §7.3 and the
`realizedScenario.ts` header — changing it invalidates every stored score.

### Mock Data Toggle

`NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env` enables mock data paths. Route Handlers check this flag before calling real external APIs. When adding new API routes, always guard with this flag.

### State & Persistence

- **`DashboardContext`** (`src/components/dashboard/context.tsx`) — single piece of UI state: `glow` (0–100), written to `--glow` CSS custom property
- **IndexedDB** (`useForecastSnapshots`) — persists up to 5 forecast snapshots client-side
- **Neon Postgres** — server-side persistence via `src/lib/db/client.ts` (`pg` Pool over the pooled `DATABASE_URL`). Provisioned in spec 010; see `context/spec/010-market-snapshot-store/`. `public.collector_status` (migration `0007`, spec 017) holds one row per collector source with `last_success_at` / `last_attempt_at` / `last_error`, upserted after every `/api/collect` run so a single failing feed is distinguishable from a whole failed run

### Styling

Tailwind CSS v4 with PostCSS (`@tailwindcss/postcss`). Theme uses CSS custom properties: `--surface-*`, `--text-*`, `--line-*`, `--glow`. Dark mode is default. Global styles in `src/app/styles/`.

Path alias `@/*` maps to `src/*`.

### Constants Rule

Any value used in two or more files goes in `src/consts/` (code constants) or `.env` / `.env.example` (environment-specific). No inline hardcoding of API keys, model names, asset IDs, or timing values.
