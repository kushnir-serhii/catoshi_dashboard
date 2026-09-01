# Tasks: Market Snapshot Store

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Technical Specification:** [technical-considerations.md](./technical-considerations.md)
- **Status:** Ready
- **Testing:** Automated tests are **skipped**, consistent with spec 009 — no test runner is configured. Each slice is gated on `npx tsc --noEmit` plus a manual check. Since this spec has no UI, the manual check is a **SQL query against Neon** rather than a browser walkthrough; each verification task names the row or value that must exist afterwards. `src/lib/indicators.ts` is kept pure so unit tests can be added later without touching the collectors.

---

## Slice 1: Schema and typed access

- [x] Provision a **Neon** project (free plan), enable the `vector` and `pg_trgm` extensions, and put the **pooled** connection string in `.env.local` as `DATABASE_URL`. The pooled host contains `-pooler`; a direct endpoint will exhaust its connection limit under serverless concurrency. **[Agent: nextjs-fullstack]**
- [x] Replace the database client: create `src/lib/db/client.ts` (a `pg` Pool over `DATABASE_URL`), delete `src/lib/supabaseClient.ts`, move `/api/signals` onto it, and swap `@supabase/supabase-js` for `pg` in `package.json`. While there, replace the blanket `catch → mockSignalsResponse` with a logged error — a dead database must stop looking like working mock data. **[Agent: nextjs-fullstack]**
- [x] Create `db/migrations/0001_analytics.sql` with `assets`, `snapshots`, `forecasts`, `outcomes` per technical-considerations §3. `snapshots` carries `UNIQUE (asset_id, ts)`; every derivative and flow column is nullable; `NOT NULL` only on `asset_id`, `ts`, `price`. Seed `assets` with BTC/ETHUSDT-style rows for BTC, ETH and SOL. **[Agent: nextjs-fullstack]**
- [x] Add the probability-sum trigger on `forecasts` — reject on `ABS(SUM(probability) - 1) > 0.02` with a message naming the actual sum (AC 2.5). **[Agent: nextjs-fullstack]**
- [x] Applied `0001_analytics.sql` and `0002_outcomes_multi_horizon.sql` to Neon via `node --env-file=.env.local scripts/migrate.mjs`; `schema_migrations` tracks both. `0002` fixes `outcomes`: `unique (forecast_id, horizon_days)` instead of `unique (forecast_id)`, because a forecast is a 365-day curve scored at several horizons, not a single-horizon call. **[Agent: nextjs-fullstack]**
- [x] Add indexes: BRIN on `snapshots(ts)`, btree on `snapshots(asset_id, ts DESC)`, btree on `snapshots(asset_id, rsi_1d)`, btree on `forecasts(asset_id, as_of DESC)` and `forecasts(model, prompt_version)`, GIN on `forecasts(scenarios jsonb_path_ops)`. **[Agent: nextjs-fullstack]**
- [x] Create `src/data/types.ts` additions — `MarketSnapshot`, `StoredForecast`, `SourceStatus` — and `src/lib/db/analytics.ts` with `upsertSnapshot()`, `insertForecasts()`, `getLatestSnapshot()` over `src/lib/db/client.ts`. **Re-opened:** the existing `analytics.ts` is written against the Supabase JS client (`.from().upsert()`) and must be rewritten as parameterised SQL. The row-mapping helpers and the types are unaffected. **[Agent: nextjs-fullstack]**
- [x] Verify: migration applies to the Neon project without error; `/api/signals` returns rows from Neon, or a logged error — never silent mocks; `npx tsc --noEmit` clean; inserting a forecast whose probabilities sum to 0.9 is rejected with the trigger's message; inserting the same `(asset_id, ts)` twice upserts to one row rather than two. **[Agent: nextjs-fullstack]**

## Slice 2: Indicator layer

- [x] Create `src/consts/collect.ts` exporting `COLLECT_ASSETS` (BTC, ETH, SOL with Binance pair and CoinGecko id), `COLLECT_TIMEFRAMES` (`15m`, `1h`, `4h`, `1d`), `KLINE_LIMIT` (200), `MA_PERIODS` (7, 25, 99), `RSI_PERIOD` (14), `ATR_PERIOD` (14), `VOLUME_Z_LOOKBACK` (20). **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/indicators.ts` with pure `rsi` (Wilder smoothing), `sma`, `atr`, `zScore`, `pctFrom`, `structure`. No I/O, no `Date`, no `Math.random` — same input must always give the same output (AC 2.4). **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` clean; `rsi()` on a known closing series matches TradingView's RSI(14) for the same series to within 0.1; calling every function twice on the same input returns identical values. **[Agent: nextjs-fullstack]**

## Slice 3: Binance collectors

- [x] Create `src/lib/collectors/binanceKlines.ts` — `fetchKlines(pair, interval, limit)` returning typed OHLCV; per-asset sequential, per-timeframe parallel. **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/collectors/binanceFutures.ts` — `fetchFunding` (`premiumIndex` + `fundingRate` for the 24h delta), `fetchOpenInterest` (`openInterest` + `openInterestHist` for the 24h change), `fetchLongShortRatio` (`globalLongShortAccountRatio`, `period=1h`). Every function resolves to `null` on non-200 rather than throwing (AC 2.2). **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` clean; a scratch call returns a plausible funding rate (order of 1e-4), an open interest figure that matches Binance's UI within rounding, and a long/short ratio between roughly 0.3 and 4.0; an intentionally bad pair returns `null` and does not throw. **[Agent: nextjs-fullstack]**

## Slice 4: Flow and sentiment collectors

- [x] Create `src/lib/collectors/fearGreed.ts` — `fetchFearGreed()` against `api.alternative.me/fng/?limit=30`, returning the current value and the value seven days ago. **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/collectors/etfFlows.ts` — parse the Farside ETH and BTC tables into `{ lastDayUsd, streakDays, sum7dUsd }`. Parse defensively: on any shape mismatch return `null` rather than throwing, and never coerce an unparsed cell to `0`. SOL returns `null` by nature. **[Agent: nextjs-fullstack]**
- [x] Verify: Fear & Greed matches the published index for today; ETF figures for ETH match Farside's own table for the latest reported day; feeding the parser a deliberately altered HTML fixture returns `null` instead of a fabricated number. **[Agent: nextjs-fullstack]**

## Slice 5: Snapshot assembly and the collection endpoint

- [x] Create `src/lib/snapshotBuilder.ts` — `buildSnapshot(symbol, hourTs)`: fetch all sources in parallel with each wrapped so a rejection yields `null`, compute indicators from whatever klines arrived, and return a typed `MarketSnapshot` plus a `raw` payload of everything gathered and a per-source `SourceStatus[]`. **[Agent: nextjs-fullstack]**
- [x] Create `src/app/api/collect/route.ts` — `CRON_SECRET` bearer check using a **timing-safe** comparison (AC 2.6); loop `COLLECT_ASSETS`; truncate the timestamp to the hour **server-side** so Actions schedule drift cannot create duplicate hours; upsert each snapshot; return `{ ok, written, sources }` so a broken parser is visible in the caller's log. **[Agent: nextjs-fullstack]**
- [x] Verify: `npx tsc --noEmit` clean; calling `/api/collect` without the secret returns 401 and writes nothing; calling it with the secret writes exactly three rows; calling it twice inside the same hour still leaves three rows with updated values; a snapshot's `rsi_1d` is within 1 point of the value shown on a TradingView daily chart for the same coin (AC 2.2, 2.3, 2.4). **[Agent: nextjs-fullstack]**

## Slice 6: Forecast persistence

- [x] Create `persistForecasts(projections, snapshotIds, usage)` in `src/lib/db/analytics.ts` — one row per coin, carrying scenarios, confidence, reasoning, service, model, `prompt_version`, token counts and computed `cost_usd`. **[Agent: ai-provider]**
- [x] Export a `PROMPT_VERSION` constant from `src/lib/forecast/claude.ts` and `src/lib/forecast/openai.ts`, and have `generateForecast()` return it alongside the projections together with the provider's token usage. Bumping it whenever a prompt changes is what keeps spec 011's accuracy metric meaningful. **[Agent: ai-provider]**
- [x] Call `persistForecasts` **inside the `unstable_cache` callback** in `src/app/api/projections/route.ts` — not in the `GET` handler, so a cache hit writes nothing (AC 2.1). Fire-and-forget with an explicit `.catch` that logs, never awaited (AC 2.6). **[Agent: ai-provider]**
- [x] Link each forecast row to the most recent snapshot for its asset, so any forecast can be joined to the conditions it was made under (AC 2.1, AC 2.5). **[Agent: ai-provider]**
- [x] Verify: `npx tsc --noEmit` clean; with a live key, one request to `/api/projections` writes three forecast rows; a second request inside the 6-hour window writes none; each row joins to a snapshot within the preceding hour; with `DATABASE_URL` pointed at an unreachable host the endpoint still returns a normal forecast and logs `[forecast-persist]` (AC 2.6). **[Agent: ai-provider]**

## Slice 7: Scheduling, cleanup and documentation

- [x] Create `.github/workflows/collect.yml` — `schedule: '0 * * * *'` plus `workflow_dispatch`, calling `COLLECT_ENDPOINT` with the `CRON_SECRET` bearer from repository secrets; fail the step on a non-200 so breakage surfaces in the Actions log. **[Agent: nextjs-fullstack]**
- [x] Add a daily `vercel.json` cron on `/api/collect` as a fallback. Vercel **Hobby accounts reject any expression that runs more than once a day**, so this entry must stay daily or the deployment fails. **[Agent: nextjs-fullstack]**
- [x] Resolve `npm run daily-analysis`: either implement `src/scripts/daily-analysis.ts` as a local manual trigger of `buildSnapshot` for all assets, or delete the script from `package.json`. It currently points at an empty directory. **[Agent: nextjs-fullstack]**
- [x] Update `context/product/architecture.md` — add a **Data Persistence** section covering Neon and the four tables, add GitHub Actions to §4 Infrastructure, and correct §3, which still lists CryptoPanic as the news source after its move to paid-only. **[Agent: nextjs-fullstack]**
- [x] Add a weekly `pg_dump` job — GitHub Actions, dumping `$DATABASE_URL` into a private repository or an Actions artifact. The Neon free plan has no automatic backups and only a 6-hour restore window, so a dropped table is otherwise unrecoverable. **[Agent: nextjs-fullstack]**
- [x] Add a README note: GitHub Actions disables scheduled workflows after 60 days without repository activity, and the Neon free plan meters compute at 100 CU-h per project per month (hourly collection uses roughly 15). **[Agent: nextjs-fullstack]**
- [x] Verify: the workflow runs on schedule and on manual dispatch; after 24 hours the table holds roughly 72 rows (3 assets × 24 hours) with no duplicate `(asset_id, ts)` pair; the Vercel deployment succeeds with the daily cron present; `npx tsc --noEmit` clean. **[Agent: nextjs-fullstack]**

---

## Recommendations

| Task/Slice | Issue | Recommendation |
| --- | --- | --- |
| All slices | Automated tests skipped per project convention | Verification is `npx tsc --noEmit` plus a SQL query against Neon. `src/lib/indicators.ts` stays pure so unit tests can be added later. |
| Slice 3, 4 | Collector correctness cannot be verified without live network access | Run the scratch calls from `npm run dev` locally before shipping; a wrong RSI is silent and will corrupt every downstream metric in spec 011. |
| Slice 4 | Farside is an HTML table, not an API — it will break eventually | Treat ETF flow as best-effort. The per-source status in the `/api/collect` response is the early-warning signal; check it after any Farside redesign. |
| Slice 5 | Liquidations require a WebSocket stream and have no hourly REST equivalent | Column exists and stays null. Revisit only if spec 012 shows the feature carries weight in the analog vector. |
| Slice 6 | Provider round-trip needs a live API key | Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` before verifying, or accept mock-mode coverage only, as in spec 009 Slice 5. |
| Slice 7 | Vercel Hobby cannot run hourly crons; GitHub Actions schedules are best-effort and can drift | Server-side hour truncation plus `UNIQUE (asset_id, ts)` makes drift harmless. If timing precision ever matters, Vercel Pro is the fix, not a workaround. |
| Post-ship | Derivatives history is not back-fillable — Binance retains roughly 30 days | Ship Slices 1–5 and start collecting before polishing Slices 6–7. Every week of delay is a week of history permanently lost. |

## Post-implementation verification fix

- [x] AC 2.4 required MA/ATR/volume-z/structure across 15m/1h/4h/1d, but the original build only computed them daily (RSI alone was per-timeframe). Added `db/migrations/0003_multitimeframe_indicators.sql` (18 new columns: `ma7/ma25/ma99/atr/volume_z/structure` × `15m/1h/4h`), extended `snapshotBuilder.ts` to compute them, and verified live against Neon for BTC. **[Agent: nextjs-fullstack]**
