# Catoshi

A crypto market-forecasting dashboard that keeps score of itself. One screen
answers three questions: **what is the market doing right now**, **what changed
that matters**, and **where do the models think it goes next — and how often
have they been right?**

Catoshi is not a portfolio tracker. There are no wallets, holdings or exchange
keys. Every number on screen is either measured or explicitly labelled as absent.
Nothing here is financial advice.

Product definition and scope: [`context/product/product-definition.md`](context/product/product-definition.md).

## Features

- **Live market prices** — auto-refreshing price, 24h change, volume and
  market cap for BTC, ETH and SOL (CoinGecko).
- **Market-state signals** — deterministic bullish / bearish / neutral signals
  (RSI, funding, open interest, long/short ratio, ETF flows, volume z-score,
  MA compression, Fear & Greed) computed from hourly snapshots stored in Neon.
- **News impact signals** — headlines classified by an LLM for direction,
  magnitude, horizon, confidence and scope (market-wide or one coin).
- **Projections** — bull / base / bear scenarios with explicit probabilities,
  generated from a computed market snapshot.
- **Models Explorer** — the track record: resolved-forecast counts, hit rate,
  Brier score and regime breakdown per provider + model + prompt version.
- **Market Pulse** — macro and market confluence summary, with optional
  operator-only Telegram alerts (gated by backtest verdict).
- **Landing page** — public page describing only what the product actually does.

Guests get the whole read-only product. Google sign-in exists for one purpose:
metering the paid Reforecast action per person.

## Tech Stack

- **Framework** — Next.js 16 (App Router), React 19, TypeScript (strict)
- **Styling** — Tailwind CSS 4, HeroUI, clsx, tailwind-merge
- **Data** — SWR polling hooks → Route Handlers → server integrations
- **Database** — Neon Postgres (`pg`), SQL migrations in `db/migrations/`
- **AI** — Anthropic SDK and OpenAI SDK (forecasts, news classification)
- **Auth** — Auth.js v5 (Google only)
- **Charts** — Recharts
- **Hosting** — Vercel, with GitHub Actions for scheduled jobs
- **Tooling** — ESLint, Prettier, tsx, `node --test`

## Project Structure

```
src/app/(admin)/   Dashboard pages: markets, signals, projections, models, admin
src/app/landing/   Public marketing page
src/app/api/       Route Handlers — the only place external APIs are called
src/lib/           Server integrations (providers, signals, news, forecasts)
src/hooks/         SWR data hooks with polling
src/components/    UI components (dashboard UI in components/dashboard/)
src/consts/        Shared constants
src/data/types.ts  Canonical TypeScript interfaces
src/scripts/       CLI scripts and tests
db/migrations/     SQL migrations (applied by scripts/migrate.mjs)
context/           Product docs, architecture, specs
docs/              Runbook and operational docs
```

Architecture details: [`context/product/architecture.md`](context/product/architecture.md)
and [`context/product/codebase-notes.md`](context/product/codebase-notes.md).

## Getting Started

### Requirements

- Node.js 20.6 or newer (scripts use `--env-file`)
- npm
- A Neon Postgres database (only needed with real data)

### Setup

```bash
npm install
cp .env.example .env.local
```

With `NEXT_PUBLIC_USE_MOCK_DATA=true` (the default in `.env.example`) the app
runs on mock data and no API keys are required. To use real data, set it to
`false` and fill in the keys documented in `.env.example` (CoinGecko, Neon,
Anthropic, OpenAI, CryptoPanic, FRED, Auth.js / Google, Telegram).

Apply database migrations (uses `DATABASE_URL_UNPOOLED`):

```bash
node --env-file=.env.local scripts/migrate.mjs
```

### Development

```bash
npm run dev
```

The app runs at http://localhost:3000 (on Windows, the script also opens it in
the browser).

### Production

```bash
npm run build
npm start
```

## Scripts

| Script                         | Description                               |
| ------------------------------ | ----------------------------------------- |
| `npm run dev`                  | Start the development server              |
| `npm run build`                | Production build                          |
| `npm start`                    | Start the production server               |
| `npm run lint`                 | Run ESLint                                |
| `npm run format`               | Format code with Prettier                 |
| `npm run format:check`         | Check formatting                          |
| `npm test`                     | Run unit tests (`src/scripts/*.test.ts`)  |
| `npx tsc --noEmit`             | Type-check                                |
| `npm run daily-analysis`       | Run the daily analysis script             |
| `npm run backfill`             | Backfill price-side snapshot history      |
| `npm run analog-gate`          | Historical-analogs falsification test     |
| `npm run today-range-backtest` | Today Range backtest                      |
| `npm run pulse-backtest`       | Market Pulse backtest                     |
| `npm run pulse-telegram-test`  | Send a test Market Pulse Telegram message |

## Scheduled Data Collection

`.github/workflows/collect.yml` calls `/api/collect` hourly to populate the
Neon `snapshots` table (spec 010). A daily `vercel.json` cron is a fallback
if that schedule ever lapses. Two things can quietly stop this without
either workflow reporting a failure:

- **GitHub Actions disables scheduled workflows after 60 days without any
  repository activity.** Any commit (to any branch) resets the clock. If
  collection appears to have stopped, check whether the workflow shows as
  disabled under the repo's Actions tab before assuming a bug in the code.
- **Neon's free plan meters compute at 100 CU-h per project per month.**
  Hourly collection uses roughly 15 CU-h of that budget — comfortable
  headroom on its own, but a runaway analytical query elsewhere against
  the same project is the realistic way to exhaust it and stall writes for
  the rest of the month.

Other workflows in `.github/workflows/`: weekly database backup, backfill and
its verification, and the analog / Today Range / Market Pulse backtests.

## Data Freshness & Health

`GET /api/health` reports, per tracked asset, the newest snapshot timestamp,
its age in minutes, and the number of snapshots in the last 24 hours, plus
each collector's last success/error from `public.collector_status`. It is
read-only, needs no secret, exposes no connection string or raw row, and makes
no external call. It returns HTTP **503** when the newest snapshot across all
assets is older than `SNAPSHOT_STALE_MINUTES` (`src/consts/collect.ts`,
currently 90 min) and **200** when fresh, so a free external uptime checker can
watch the single URL and be the whole alerting layer. The same threshold
drives the muted "collection may be stalled" note on the Signals page.

Operational procedures — reading `/api/health`, re-running a missed hour,
restoring the database — live in [`docs/runbook.md`](docs/runbook.md).

## License

This project is free to use and modify.
