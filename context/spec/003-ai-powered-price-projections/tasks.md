# Task List: AI-Powered Price Projections

- **Spec:** [003-ai-powered-price-projections](.)
- **Status:** In Progress
- **Technical Spec:** [technical-considerations.md](technical-considerations.md)
- **Functional Spec:** [functional-spec.md](functional-spec.md)

---

## Slice 1: Scaffold — types, dependencies, remove legacy projections plumbing
*Goal: App still runs and compiles after teardown. Seeded fallback chart remains visible.*

- [x] Install the `openai` npm package **[Agent: nextjs-fullstack]**
- [x] Add `OPENAI_API_KEY` to `.env.example` **[Agent: nextjs-fullstack]**
- [x] Extend `ProjectionData` in `src/data/types.ts` with `confidence: number`, `reasoning: string[]`, `service: string`, `model: string` **[Agent: nextjs-fullstack]**
- [x] Add `ForecastSnapshot` interface to `src/data/types.ts` (id, name, savedAt, coin, service, model, projection) **[Agent: nextjs-fullstack]**
- [x] Delete `src/scripts/daily-analysis.ts` (replaced by ISR route) **[Agent: nextjs-fullstack]**
- [x] Gut `src/app/api/projections/route.ts` — remove Supabase calls, return seeded mock `ProjectionsResponse` for all three coins (BTC/ETH/SOL) with stub values for confidence/reasoning/service/model **[Agent: nextjs-fullstack]**
- [x] Run `npx tsc --noEmit` — verify zero type errors **[Agent: nextjs-fullstack]**

---

## Slice 2: Server-side forecast engine (mock-gated)
*Goal: The AI provider abstraction exists and can be called. With `MOCK=true` it returns deterministic seeded data. With real keys it calls the real API.*

- [x] Create `src/lib/marketData.ts` — exports `fetchMarketData()` pulling RSS, Fear & Greed, CoinGecko 90-day history for BTC/ETH/SOL, Reddit **[Agent: ai-provider]**
- [x] Create `src/lib/forecast/claude.ts` — Anthropic SDK tool-use call that receives `marketData` and returns `ProjectionData[]` with all new fields populated **[Agent: ai-provider]**
- [x] Create `src/lib/forecast/openai.ts` — OpenAI SDK structured output call (same input/output contract as claude.ts) **[Agent: ai-provider]**
- [x] Create `src/lib/forecastProvider.ts` — exports `generateForecast(service, model, marketData)` that routes to the correct module; validates service/model against hardcoded allowlist **[Agent: ai-provider]**
- [x] Run `npx tsc --noEmit` — verify zero type errors across all new lib files **[Agent: ai-provider]**

---

## Slice 3: ISR GET route + on-demand refresh POST route
*Goal: `GET /api/projections` caches results for 6 hours via `unstable_cache`. `POST /api/projections/refresh` busts the cache and returns fresh data. Both work without a rebuild.*

- [x] Rewrite `src/app/api/projections/route.ts` — wrap `fetchMarketData()` + `generateForecast()` in `unstable_cache(['projections', service, model], { revalidate: 21600, tags: ['projections'] })`; read `service`/`model` from query params with fallback to `claude`/`claude-sonnet-4-6` **[Agent: ai-provider]**
- [x] Create `src/app/api/projections/refresh/route.ts` — POST handler that validates body params, calls `revalidateTag('projections')`, then calls `generateForecast()` immediately and returns fresh `ProjectionsResponse` **[Agent: ai-provider]**
- [x] Verify: run `npm run dev`, curl `GET /api/projections` with `NEXT_PUBLIC_USE_MOCK_DATA=true` — assert response contains `ProjectionData[]` for BTC, ETH, SOL with all fields present **[Agent: nextjs-fullstack]**
- [x] Verify: curl `POST /api/projections/refresh` with `{ "service": "claude", "model": "claude-sonnet-4-6" }` — assert 200 response with valid `ProjectionsResponse` **[Agent: nextjs-fullstack]**

---

## Slice 4: Coin tabs on the projections chart
*Goal: BTC / ETH / SOL tabs are visible. Switching tabs updates the chart. All three use seeded/mock data at this stage.*

- [x] Update `src/hooks/useProjections.ts` — accept `service` and `model` params, include them in SWR cache key and fetch URL; expose `refresh(service, model)` function **[Agent: nextjs-fullstack]**
- [x] Add `selectedCoin` state (`'BTC' | 'ETH' | 'SOL'`, default `'BTC'`) to `src/components/pages/ProjectionsPage.tsx`; pass to `ChartPanel` **[Agent: nextjs-fullstack]**
- [x] Update `src/components/panels/ChartPanel.tsx` — render coin tab bar (BTC / ETH / SOL buttons); filter `projections[]` by `selectedCoin` to pass the correct `ProjectionData` to `ProjectionChart` **[Agent: nextjs-fullstack]**
- [x] Verify: open `/` in browser — confirm three tabs render, clicking ETH/SOL switches the chart data (different curves visible) **[Agent: nextjs-fullstack]**

---

## Slice 5: Forecast context panel + stale warning
*Goal: Below the chart, users always see confidence score, last updated time, key reasons, and service/model label. A stale banner appears when data is old.*

- [x] Create `src/components/dashboard/ForecastContextPanel.tsx` — renders confidence %, "Updated X ago" timestamp, reasoning bullet points as dot-separated line, service+model badge; shows stale warning banner when `isStale` is true **[Agent: nextjs-fullstack]**
- [x] Wire `ForecastContextPanel` into `src/components/panels/ChartPanel.tsx` — passes active coin's `ProjectionData` and `isStale` flag **[Agent: nextjs-fullstack]**
- [x] Verify: panel is visible below chart with stubbed confidence score, reasoning text, and "Claude claude-sonnet-4-6" badge from seeded mock data **[Agent: nextjs-fullstack]**

---

## Slice 6: `useForecastSettings` (localStorage) + manual refresh button
*Goal: Service/model preference persists in the browser. User can click "Refresh forecast" and see the button enter a loading state then return.*

- [x] Create `src/hooks/useForecastSettings.ts` — reads/writes `catoshi:forecast-settings` in `localStorage`; includes SSR guard (`typeof window !== 'undefined'`); returns `{ service, model, setService, setModel }` with defaults `claude` / `claude-sonnet-4-6` **[Agent: nextjs-fullstack]**
- [x] Integrate `useForecastSettings` into `ProjectionsPage` — pass `service`/`model` to `useProjections` **[Agent: nextjs-fullstack]**
- [x] Add "Refresh forecast" button to `ChartPanel` — disabled + spinner while `isRefreshing`; on click calls `refresh(service, model)` from `useProjections` **[Agent: nextjs-fullstack]**
- [x] Verify: click "Refresh forecast" — button shows loading state; after response, `generatedAt` timestamp in context panel updates **[Agent: nextjs-fullstack]**

---

## Slice 7: Settings modal — AI provider & model selector
*Goal: User can open a modal, pick Claude or OpenAI and a specific model, click "Apply & Refresh", and the context panel's service/model badge updates.*

- [x] Create `src/components/dashboard/ForecastSettingsModal.tsx` — Section 1: service radio (Claude / OpenAI), model pills per service (hardcoded lists), "Apply & Refresh" button that writes localStorage via `setService`/`setModel` then calls `refresh(service, model)` and closes modal **[Agent: nextjs-fullstack]**
- [x] Add gear icon button to `ChartPanel` that toggles `isSettingsOpen` state; render `ForecastSettingsModal` when open **[Agent: nextjs-fullstack]**
- [x] Verify: open modal → select OpenAI / GPT-4o → click Apply & Refresh → modal closes → context panel badge updates to "OpenAI GPT-4o"; reload page → OpenAI/GPT-4o still pre-selected **[Agent: nextjs-fullstack]**

---

## Slice 8: `useForecastSnapshots` (IndexedDB) + save snapshot button
*Goal: User can save the current forecast under a name. Snapshots survive page reloads. Save button disables when 5 slots are full.*

- [x] Create `src/hooks/useForecastSnapshots.ts` — native `indexedDB` API; store name `catoshi-snapshots`; exports `{ snapshots, save(name, coin, projection), remove(id), rename(id, name), load(id) }`; max 5 enforced; full try/catch with graceful IDB-unavailable handling **[Agent: nextjs-fullstack]**
- [x] Add "Save snapshot" button to `ProjectionsPage` — on click shows inline name input; on confirm calls `snapshots.save(name, selectedCoin, activeProjection)`; button disabled with "Delete a saved forecast to save a new one" message when 5 slots full **[Agent: nextjs-fullstack]**
- [x] Verify: save a snapshot named "test-1" → reload page → snapshot still listed in hook state (persisted in IDB) **[Agent: nextjs-fullstack]**

---

## Slice 9: Saved forecasts list in settings modal
*Goal: The settings modal's Saved Forecasts section shows up to 5 snapshots. User can load, rename, and delete them.*

- [x] Add Section 2 "Saved Forecasts" to `ForecastSettingsModal` — renders snapshot cards (name, coin, service, date); clicking a card calls `snapshots.load(id)` and passes the snapshot's `ProjectionData` back to `ProjectionsPage` to display on the chart; each card has an inline editable name and a delete icon **[Agent: nextjs-fullstack]**
- [x] Wire snapshot loading in `ProjectionsPage` — when a snapshot is loaded, override the active `ProjectionData` displayed in `ChartPanel` and `ForecastContextPanel` with the snapshot's data **[Agent: nextjs-fullstack]**
- [x] Verify: save 2 snapshots → open settings modal → both appear in Saved Forecasts → click one → chart and context panel reflect that snapshot's data → rename it → new name persists after modal close → delete it → removed from list **[Agent: nextjs-fullstack]**

---

## Slice 10: Feature Testing & Regression
*Goal: All acceptance criteria from the functional spec are confirmed passing.*

- [x] Run full acceptance criteria sweep against functional-spec.md sections 2.1–2.8 — tick each passing criterion **[Agent: nextjs-fullstack]**
- [x] Verify stale warning: set `generatedAt` to 8 hours ago in mock data — confirm stale banner appears on chart **[Agent: nextjs-fullstack]**
- [x] Verify IndexedDB graceful fallback: simulate IDB unavailable — confirm save button disables cleanly without crash **[Agent: nextjs-fullstack]**
- [x] Verify server-side allowlist: send `service=unknown&model=bad` to `GET /api/projections` — confirm falls back to `claude`/`claude-sonnet-4-6` without error **[Agent: nextjs-fullstack]**
- [x] Run `npx tsc --noEmit` and `npm run build` — confirm zero errors **[Agent: nextjs-fullstack]**
