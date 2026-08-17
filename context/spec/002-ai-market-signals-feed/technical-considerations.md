# Technical Specification: AI / Market Signals Feed

- **Functional Specification:** `context/spec/002-ai-market-signals-feed/functional-spec.md`
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

A new Route Handler at `GET /api/signals` acts as the full signals pipeline. On a cache miss, it fetches the top hot news posts from CryptoPanic, sends them to Claude Sonnet 4.6 to classify and rewrite, and returns a structured JSON response. Next.js ISR (`export const revalidate = 21600`) caches the entire response for 6 hours — no cron job, no database, no extra infrastructure.

The client follows the same pattern already established by `usePrices`: a `useSignals` SWR hook polls `/api/signals` every 60 seconds. Within a 6-hour window it always hits the cache. On cache expiry, Next.js regenerates in the background and serves stale-while-revalidate. On CryptoPanic failure after cache expiry, SWR surfaces `isStale = true`, and the UI shows the warning banner over the last known signals.

The `SignalsPage` component is updated to consume `useSignals()` in place of the current static mock import, and gains skeleton loading, the stale banner, coin chips, and the two timestamps.

---

## 2. Proposed Solution & Implementation Plan

### 2.1 New TypeScript Interfaces (`src/data/types.ts`)

Two new interfaces are added alongside the existing ones:

**`SignalItem`** — the shape of a single live signal:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier from the news source |
| `tag` | `'BULLISH' \| 'BEARISH' \| 'NEUTRAL'` | Claude's classification |
| `title` | `string` | Rewritten headline, max 8 words |
| `body` | `string` | One-sentence summary, max 20 words |
| `source` | `string` | Publication domain (e.g. `coindesk.com`) |
| `publishedAt` | `string` | ISO 8601 timestamp |
| `coins` | `Array<'BTC' \| 'ETH' \| 'SOL' \| 'LINK' \| 'ARB' \| 'TAO'>` | Relevant tracked assets (may be empty) |

**`SignalsResponse`** — the full API response shape:

| Field | Type | Description |
|---|---|---|
| `lastUpdated` | `string` | ISO timestamp when this batch was generated |
| `nextUpdate` | `string` | `lastUpdated + 6h`, ISO timestamp |
| `fetchError` | `boolean?` | Present and `true` when CryptoPanic was unreachable |
| `signals` | `SignalItem[]` | Exactly 6 items |

The existing `Signal` interface in `src/data/types.ts` is replaced by `SignalItem`. Any files still referencing it are updated.

---

### 2.2 Shared Constants (`src/consts/signals.ts`)

A new constants file, mirroring the pattern in `src/consts/prices.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `TRACKED_COINS` | `['BTC', 'ETH', 'SOL', 'LINK', 'ARB', 'TAO']` | Allowed values for the `coins` field |
| `SIGNALS_COUNT` | `6` | Number of signals to return |
| `SIGNALS_REVALIDATE_SECONDS` | `21600` | ISR cache TTL (6h) |
| `SIGNALS_REFRESH_INTERVAL_MS` | `60_000` | SWR polling interval |
| `CLAUDE_SIGNALS_MODEL` | `'claude-sonnet-4-6'` | Model used for classification |

---

### 2.3 Route Handler (`src/app/api/signals/route.ts`)

- **Method:** `GET`
- **Cache:** `export const revalidate = 21600` at module level — the entire response is cached for 6 hours by Next.js ISR
- **Mock bypass:** If `process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, return the static mock from `src/data/signals.ts` immediately (no external calls)
- **Required env vars:** `CRYPTOPANIC_API_KEY` (server-only), `ANTHROPIC_API_KEY` (server-only)

**Pipeline (on cache miss):**

1. `GET https://cryptopanic.com/api/v1/posts/?auth_token=…&filter=hot&kind=news&public=true` — fetch the top 10 hot news posts
2. If CryptoPanic fails → return `{ fetchError: true }` with HTTP 502
3. Send the 10 titles + summaries to Claude Sonnet 4.6 via the Anthropic SDK, requesting a structured JSON array of 6 `SignalItem` objects
4. Claude prompt instructs: select top 6 by market relevance, classify (BULLISH/BEARISH/NEUTRAL per the rule set), rewrite title ≤8 words, write body ≤20 words, identify tracked coins
5. Claude response is parsed and validated; fallback returns 502 if parsing fails
6. Set `lastUpdated = now`, `nextUpdate = now + 6h`
7. Return `SignalsResponse` as `NextResponse.json(…)`

**Claude structured output:** Use `tool_use` with a strict JSON schema to guarantee parseable output rather than free-text prose.

---

### 2.4 Client Fetch Function (`src/lib/signals.ts`)

New file following the pattern of `src/lib/coingecko.ts`:

- `fetchSignals(): Promise<SignalsResponse>` — calls `GET /api/signals`, throws on non-OK response

---

### 2.5 SWR Hook (`src/hooks/useSignals.ts`)

New file following the pattern of `src/hooks/usePrices.ts`:

- `useSWR` with key `'signals'`, fetcher `fetchSignals`, `refreshInterval: SIGNALS_REFRESH_INTERVAL_MS`, `keepPreviousData: true`
- Returns: `{ signals, lastUpdated, nextUpdate, fetchError, isLoading, isStale }`
  - `isLoading = swrLoading && !data` — true only on first load with no prior data (skeleton state)
  - `isStale = !!error && !!data` — true when fetch failed but previous data is present (stale banner)

---

### 2.6 Updated `SignalsPage` (`src/components/pages/SignalsPage.tsx`)

The component is rewritten to:

1. Call `useSignals()` instead of importing static `signalItems`
2. **Loading state:** when `isLoading`, render 6 `<SignalCardSkeleton />` components (placeholder cards)
3. **Stale banner:** when `isStale || fetchError`, render a warning strip above the cards
4. **Timestamps:** render "Last updated" and "Next update" using `new Date(lastUpdated).toLocaleString()` — browser locale and timezone apply automatically
5. **Signal cards:** update `SignalCard` to accept `SignalItem`, render coin chip badges, display `source` and `publishedAt` in the card footer

The filter buttons (`All`, `Bullish`, `Bearish`, `Neutral`) are retained; they filter the 6 signals client-side by `tag`.

---

### 2.7 Updated Mock Data (`src/data/signals.ts`)

The existing static array is updated to conform to `SignalsResponse` shape so the mock bypass path in the Route Handler returns valid data during local development without API keys.

---

### 2.8 Environment Variables

Two new **server-only** env vars (not prefixed with `NEXT_PUBLIC_`):

| Variable | Where | Purpose |
|---|---|---|
| `CRYPTOPANIC_API_KEY` | Vercel project settings | Authenticates CryptoPanic free-tier API |
| `ANTHROPIC_API_KEY` | Vercel project settings | Authenticates Claude Sonnet API for classification |

Add both to `.env.example` with placeholder values (no real keys).

---

## 3. Impact and Risk Analysis

**System Dependencies:**
- New npm package: `@anthropic-ai/sdk` — used only in the Route Handler (server-side)
- Two new env vars must be provisioned in Vercel before deploying

**Potential Risks & Mitigations:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Claude returns malformed JSON | Low | Use `tool_use` with strict schema; catch parse errors and return 502 so SWR falls back to cached data |
| CryptoPanic API rate limit (free tier: ~100 req/day) | Very low | ISR means at most 4 calls per day |
| ISR cold start latency (first request after 6h expiry) | Medium | Next.js stale-while-revalidate serves the cached response to the triggering user; new batch generates in background |
| `ANTHROPIC_API_KEY` accidentally exposed | Low | Server-only env var; Route Handler never returns it; not prefixed `NEXT_PUBLIC_` |
| No data on very first deployment | Low | Mock data fallback via `NEXT_PUBLIC_USE_MOCK_DATA=true` covers development; first Vercel cold start generates real data |

---

## 4. Testing Strategy

- **Mock data path:** Set `NEXT_PUBLIC_USE_MOCK_DATA=true` locally — verify `SignalsPage` renders 6 cards with correct shape, skeleton appears when `isLoading`, stale banner appears when `isStale`
- **Unit test:** `classifyAndFormat()` pure helper function — given mock CryptoPanic API response → assert correct `SignalItem[]` output (tag, title length, body length, coins subset)
- **Integration smoke test:** Run the app with real API keys, hit `/api/signals` directly — assert response matches `SignalsResponse` schema and contains exactly 6 items
- **Manual acceptance criteria checklist:** Walk through all 12 acceptance criteria in the functional spec on a local build before merging
