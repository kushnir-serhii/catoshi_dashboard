# Task List: AI / Market Signals Feed

- **Spec:** `context/spec/002-ai-market-signals-feed/functional-spec.md`
- **Technical Spec:** `context/spec/002-ai-market-signals-feed/technical-considerations.md`
- **Status:** Ready

---

## Slice 1: `/api/signals` returns a valid mock `SignalsResponse`

_Goal: a working API endpoint with the correct data shape, all in mock mode. The existing `SignalsPage` and `SignalsPanel` remain untouched and working._

- [x] Install `@anthropic-ai/sdk` via `npm install @anthropic-ai/sdk`. **[Agent: general-purpose]**
- [x] Add to `.env.example`: `CRYPTOPANIC_API_KEY=your_key_here` and `ANTHROPIC_API_KEY=your_key_here`. **[Agent: general-purpose]**
- [x] Add `SignalItem` and `SignalsResponse` interfaces to `src/data/types.ts` (alongside existing `Signal` — do not remove it; `SignalsPanel` still depends on it). **[Agent: nextjs-fullstack]**
- [x] Create `src/consts/signals.ts` — export `TRACKED_COINS`, `SIGNALS_COUNT`, `SIGNALS_REVALIDATE_SECONDS`, `SIGNALS_REFRESH_INTERVAL_MS`, `CLAUDE_SIGNALS_MODEL`. **[Agent: nextjs-fullstack]**
- [x] Update `src/data/signals.ts` — add and export a `mockSignalsResponse: SignalsResponse` const (6 mock `SignalItem` entries with realistic coin chips). Keep existing `signalItems` and `panelSignalItems` exports intact (still used by `SignalsPanel`). **[Agent: nextjs-fullstack]**
- [x] Create `src/app/api/signals/route.ts` — stub handler: if `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, return `mockSignalsResponse` immediately; otherwise return `{ error: 'not implemented' }` with HTTP 501. **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/signals.ts` — export `fetchSignals(): Promise<SignalsResponse>` calling `GET /api/signals`, throwing on non-OK response. **[Agent: nextjs-fullstack]**
- [x] Verify: start dev server with `NEXT_PUBLIC_USE_MOCK_DATA=true` and run `curl "http://localhost:3000/api/signals"` — confirm JSON contains `lastUpdated`, `nextUpdate`, and a `signals` array of exactly 6 items each with `id`, `tag`, `title`, `body`, `source`, `publishedAt`, `coins`. **[Agent: general-purpose]**

---

## Slice 2: `SignalsPage` connected to hook — new card shape, coin chips, timestamps

_Goal: the Signals page renders 6 real-shaped cards from mock data via the SWR hook, with coin chips and update timestamps. Skeleton shows on first load._

- [x] Create `src/hooks/useSignals.ts` — `useSWR` with key `'signals'`, fetcher `fetchSignals`, `refreshInterval: SIGNALS_REFRESH_INTERVAL_MS`, `keepPreviousData: true`. Returns `{ signals, lastUpdated, nextUpdate, fetchError, isLoading, isStale }`. **[Agent: nextjs-fullstack]**
- [x] Rewrite `src/components/pages/SignalsPage.tsx`:
  - [x] Replace static `signalItems` import with `useSignals()` call. **[Agent: nextjs-fullstack]**
  - [x] Add `SignalCardSkeleton` sub-component — 6 `animate-pulse` placeholder cards rendered when `isLoading`. **[Agent: nextjs-fullstack]**
  - [x] Update `SignalCard` to accept `SignalItem` — render `tag`, `title`, `body`, `source`, `publishedAt`. **[Agent: nextjs-fullstack]**
  - [x] Add coin chip badges to `SignalCard` — map `coins[]` to small inline badge elements. **[Agent: nextjs-fullstack]**
  - [x] Add timestamps row above or below the cards: "Last updated: {toLocaleString(lastUpdated)}" and "Next update: {toLocaleString(nextUpdate)}". **[Agent: nextjs-fullstack]**
- [x] Verify: open `http://localhost:3000/signals` in the browser — confirm 6 mock signal cards render, coin chips are visible, "Last updated" and "Next update" timestamps show in local time, briefly set `isLoading={true}` prop to confirm skeleton cards appear. **[Agent: nextjs-fullstack]**

---

## Slice 3: Stale data warning banner end-to-end

_Goal: when the SWR fetch fails and previous data exists, a visible warning banner appears above the cards without hiding them._

- [x] Add a stale warning banner to `SignalsPage` — rendered when `isStale` is `true`, positioned above the signal cards, text: "Data may be outdated". **[Agent: nextjs-fullstack]**
- [x] Verify: open `/signals`, then in DevTools → Network → set to "Offline", wait for the 60s SWR refresh tick to fail — confirm the warning banner appears above the cards and all 6 mock signal cards remain fully visible. Restore network and confirm banner disappears on next successful fetch. **[Agent: nextjs-fullstack]**

---

## Slice 4: Live Route Handler — real CryptoPanic + Claude classification

_Goal: with real API keys, `/api/signals` returns 6 live classified signals rewritten by Claude Sonnet. ISR caches the response for 6 hours._

- [x] Add `CRYPTOPANIC_API_KEY` and `ANTHROPIC_API_KEY` to `.env.local` (real keys — not committed). **[Agent: general-purpose]**
- [x] Implement the live pipeline in `src/app/api/signals/route.ts`:
  - [x] Add `export const revalidate = 21600` at module level for Next.js ISR 6h caching. **[Agent: nextjs-fullstack]**
  - [x] When `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, short-circuit and return `mockSignalsResponse`. **[Agent: nextjs-fullstack]**
  - [x] Fetch `https://cryptopanic.com/api/v1/posts/?auth_token=…&filter=hot&kind=news&public=true` — on failure, return HTTP 502 with `{ fetchError: true }`. **[Agent: nextjs-fullstack]**
  - [x] Build a `tool_use` call to `claude-sonnet-4-6` with a strict JSON schema (`SignalItem[]`, exactly 6 items) — instruct Claude to select top 6 by relevance, classify, rewrite title ≤8 words, write body ≤20 words, and identify coins from `TRACKED_COINS`. **[Agent: nextjs-fullstack]**
  - [x] Parse and validate Claude's structured response; return HTTP 502 on parse failure. **[Agent: nextjs-fullstack]**
  - [x] Set `lastUpdated = new Date().toISOString()`, `nextUpdate = new Date(Date.now() + 6h).toISOString()`. **[Agent: nextjs-fullstack]**
  - [x] Return `SignalsResponse` as `NextResponse.json(…)`. **[Agent: nextjs-fullstack]**
- [x] Verify: set `NEXT_PUBLIC_USE_MOCK_DATA=false` in `.env.local` and restart dev server. Run `curl "http://localhost:3000/api/signals"` — confirm response contains 6 live signals with real titles, BULLISH/BEARISH/NEUTRAL tags, rewritten headlines ≤8 words, and correct `lastUpdated`/`nextUpdate` timestamps. Open `/signals` in browser and confirm the live signals render with coin chips and timestamps. **[Agent: general-purpose]**
