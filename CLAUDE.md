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
- `src/app/api/` — Route Handlers acting as a server-side proxy layer for all external calls (CoinGecko, AI providers, Reddit, news RSS, fear/greed index)

The admin layout (`(admin)/layout.tsx`) wraps everything in `DashboardShell`. Pages live under `src/app/(admin)/projections/`, `markets/`, `portfolio/`, `signals/`, `models/`.

### Data Flow

```
UI Component
  → SWR hook (src/hooks/)
    → fetch /api/<route>  (Route Handler)
      → src/lib/<provider>.ts  (external API call)
```

All external API calls must go through Route Handlers — never call third-party APIs directly from client components.

### Key Directories

- **`src/lib/`** — server-side integrations: `coingecko.ts`, `marketData.ts` (aggregates news/fear-greed/Reddit), `forecastProvider.ts` (validates service+model, delegates to `forecast/claude.ts` or `forecast/openai.ts`), `supabaseClient.ts`
- **`src/hooks/`** — SWR-based data hooks with polling: `usePrices.ts` (60s), `useSignals.ts`, `useProjections.ts`, `useMarkets.ts`, `useHistoricalPrices.ts`, `useCoinSearch.ts`. `useForecastSnapshots.ts` wraps IndexedDB (max 5 snapshots, graceful fallback for private browsing).
- **`src/data/types.ts`** — canonical TypeScript interfaces: `PriceMap`, `MarketAsset`, `ProjectionData`, `ForecastSnapshot`, `Signal`, `KpiItem`, `SignalItem`
- **`src/consts/`** — shared constants only (see memory rule). `prices.ts` holds `DEFAULT_ASSET_IDS`, refresh intervals, cache TTLs. `signals.ts` holds `TRACKED_COINS`, model names, revalidation seconds.
- **`src/components/dashboard/`** — dashboard UI: `charts.tsx` (Recharts `ProjectionChart`, SVG `Sparkline`, `HoldingsDonut`), `context.tsx` (glow CSS variable), `DashboardShell.tsx`, `ForecastContextPanel.tsx`, `ForecastSettingsModal.tsx`, `HistoricalPriceChart.tsx`

### AI Forecast Layer

`src/lib/forecastProvider.ts` validates `{ service, model }` pairs and delegates:
- Claude models (via `@anthropic-ai/sdk`): `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-8`
- OpenAI models: `gpt-4o-mini`, `gpt-4o`

The `CLAUDE_SIGNALS_MODEL` constant in `src/consts/signals.ts` is `'claude-sonnet-4-6'`.

### Mock Data Toggle

`NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env` enables mock data paths. Route Handlers check this flag before calling real external APIs. When adding new API routes, always guard with this flag.

### State & Persistence

- **`DashboardContext`** (`src/components/dashboard/context.tsx`) — single piece of UI state: `glow` (0–100), written to `--glow` CSS custom property
- **IndexedDB** (`useForecastSnapshots`) — persists up to 5 forecast snapshots client-side
- **Supabase** — server-side persistence via `src/lib/supabaseClient.ts`

### Styling

Tailwind CSS v4 with PostCSS (`@tailwindcss/postcss`). Theme uses CSS custom properties: `--surface-*`, `--text-*`, `--line-*`, `--glow`. Dark mode is default. Global styles in `src/app/styles/`.

Path alias `@/*` maps to `src/*`.

### Constants Rule

Any value used in two or more files goes in `src/consts/` (code constants) or `.env` / `.env.example` (environment-specific). No inline hardcoding of API keys, model names, asset IDs, or timing values.
