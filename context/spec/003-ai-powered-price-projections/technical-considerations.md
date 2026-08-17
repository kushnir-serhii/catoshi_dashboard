# Technical Specification: AI-Powered Price Projections

- **Functional Specification:** [context/spec/003-ai-powered-price-projections/functional-spec.md](context/spec/003-ai-powered-price-projections/functional-spec.md)
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

The existing `daily-analysis.ts` script and Supabase dependency are **removed from the projections pipeline entirely**. Instead, the `/api/projections` Route Handler calls the AI provider directly at request time, with the result cached server-side for 6 hours using Next.js `unstable_cache` tagged `'projections'`. A dedicated refresh endpoint accepts service/model parameters from the browser, busts that tag, and returns fresh data — no rebuild or re-deploy required.

Client-side, two new browser-storage hooks manage persistent preferences (`localStorage` for service/model choice) and saved snapshots (`IndexedDB` for up to 5 named forecast objects). A new AI provider abstraction layer routes identically structured calls to either the Anthropic or OpenAI SDK, keeping the Route Handler service-agnostic.

**Systems affected:** `/api/projections` route, `ProjectionData` type, `ProjectionsPage` and its child components, new `ForecastContextPanel` and `ForecastSettingsModal` components, two new client hooks, one new server library.

---

## 2. Proposed Solution & Implementation Plan

### 2.1 Architecture Changes

The projection data flow changes from **cron → Supabase → API** to **request → cached AI call → response**:

```
Browser (SWR, 1h poll)
  └── GET /api/projections?service=claude&model=sonnet
        └── unstable_cache(['projections', service, model], revalidate=21600)
              └── fetchMarketData() + generateForecast(service, model)
                    ├── Anthropic SDK  (if service=claude)
                    └── OpenAI SDK     (if service=openai)

Browser ("Refresh forecast" / "Apply & Refresh" click)
  └── POST /api/projections/refresh  { service, model }
        └── revalidateTag('projections') → cache cleared
        └── calls generateForecast() immediately → returns fresh data
```

`src/scripts/daily-analysis.ts` and the Supabase dependency in the projections route are **removed**. The signals route's Supabase usage is unaffected.

---

### 2.2 Type Changes

**File:** `src/data/types.ts` — extend `ProjectionData` with four new fields:

| Field | Type | Description |
|---|---|---|
| `confidence` | `number` | 0–100, AI-assigned confidence for this forecast |
| `reasoning` | `string[]` | 2–3 short bullet points explaining the forecast |
| `service` | `'claude' \| 'openai'` | Which AI service produced this forecast |
| `model` | `string` | Specific model ID (e.g. `'claude-sonnet-4-6'`, `'gpt-4o'`) |

New type `ForecastSnapshot` for browser snapshot storage:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | UUID |
| `name` | `string` | User-defined label |
| `savedAt` | `string` | ISO timestamp |
| `coin` | `string` | Active coin at save time |
| `service` | `string` | Service used |
| `model` | `string` | Model used |
| `projection` | `ProjectionData` | Full snapshot of the forecast data |

---

### 2.3 New Environment Variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for GPT-based forecasts |

Existing `ANTHROPIC_API_KEY` already present. Add `OPENAI_API_KEY` to `.env.example`.

New dependency: `openai` npm package (official OpenAI SDK).

---

### 2.4 New Server Library: AI Provider Abstraction

**File:** `src/lib/forecastProvider.ts`

Single exported function: `generateForecast(service, model, marketData) → ProjectionData[]`

Routes to either:
- `src/lib/forecast/claude.ts` — Anthropic SDK, tool-use pattern (mirrors existing `daily-analysis.ts` approach)
- `src/lib/forecast/openai.ts` — OpenAI SDK, structured JSON response format

Both modules receive the same `marketData` shape (RSS, Fear & Greed, CoinGecko history) and return the same `ProjectionData[]` shape including `confidence`, `reasoning`, `service`, `model`.

**File:** `src/lib/marketData.ts`

Extracted from `daily-analysis.ts`. Exports `fetchMarketData() → { news, fearGreed, trending, reddit, historicalPrices }`. Used by the Route Handler.

---

### 2.5 Updated API Routes

#### `GET /api/projections`

| Attribute | Value |
|---|---|
| Method | `GET` |
| Query params | `service` (`claude` \| `openai`), `model` (string) |
| Caching | `unstable_cache` with tag `'projections'`, `revalidate: 21600` (6h) |
| On miss | Calls `fetchMarketData()` → `generateForecast(service, model, data)` |
| Response | `ProjectionsResponse` — array of `ProjectionData` for BTC, ETH, SOL |
| Fallback | If AI call throws, Next.js serves the last stale cached entry automatically |
| Mock | Returns seeded data when `NEXT_PUBLIC_USE_MOCK_DATA=true` |

The cache key includes `[service, model]` so switching providers creates a distinct cache entry. Unknown `service`/`model` values are rejected server-side and fall back to `claude` / `claude-sonnet-4-6`.

#### `POST /api/projections/refresh`

| Attribute | Value |
|---|---|
| Method | `POST` |
| Body | `{ service: string, model: string }` |
| Action | Validates service/model, calls `revalidateTag('projections')`, then immediately calls `generateForecast` and returns fresh data |
| Response | `ProjectionsResponse` |
| On error | Returns `{ error: string }` with HTTP 500; client keeps current forecast |

---

### 2.6 Updated `useProjections` Hook

**File:** `src/hooks/useProjections.ts`

- Reads `service` and `model` from `useForecastSettings()`
- Appends them as query params to the SWR fetch key: `['projections', service, model]`
- Exposes a `refresh(service, model)` function that calls `POST /api/projections/refresh` and mutates the SWR cache with the response
- Returns: `{ projections, generatedAt, isLoading, isStale, refresh }`

**Stale detection:** `isStale` is `true` if `generatedAt` is older than 7 hours (one hour past the expected 6h window) OR if the last fetch errored while prior data exists.

---

### 2.7 New Client Hooks

#### `src/hooks/useForecastSettings.ts`

Reads and writes `localStorage` key `catoshi:forecast-settings`.

Returns: `{ service, model, setService, setModel }` with defaults `claude` / `claude-sonnet-4-6`.

Hardcoded model options per service:
- Claude: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`
- OpenAI: `gpt-4o-mini`, `gpt-4o`

#### `src/hooks/useForecastSnapshots.ts`

Reads and writes `IndexedDB` store `catoshi-snapshots` using the browser's native `indexedDB` API (no extra library).

Returns: `{ snapshots, save(name, coin, projection), remove(id), rename(id, name), load(id) }`

Max 5 entries enforced in `save()` — returns an error string if at capacity. All IDB calls wrapped in try/catch; gracefully disables snapshot functionality if IndexedDB is unavailable (private browsing).

---

### 2.8 New & Modified UI Components

#### Modified: `src/components/pages/ProjectionsPage.tsx`
- Adds `selectedCoin` state (`'BTC' | 'ETH' | 'SOL'`, default `'BTC'`)
- Passes `selectedCoin`, `setSelectedCoin`, `refresh`, `isRefreshing` to `ChartPanel`
- Renders `ForecastSettingsModal` (controlled by `isSettingsOpen` state)
- Handles "Save snapshot" logic: opens inline name prompt, calls `snapshots.save(...)`

#### Modified: `src/components/panels/ChartPanel.tsx`
- Adds coin tab bar (BTC / ETH / SOL) above the chart
- Filters `projections[]` to find the active coin's `ProjectionData`
- Passes active `ProjectionData` to `ProjectionChart`
- Renders `ForecastContextPanel` below the chart
- Shows "Refresh forecast" button (disabled + spinner while refreshing)
- Shows gear icon button that opens `ForecastSettingsModal`

#### New: `src/components/dashboard/ForecastContextPanel.tsx`
Always-visible panel displaying:

| Element | Source |
|---|---|
| Confidence score | `projectionData.confidence` as a percentage |
| Last updated | `projectionData.generatedAt` formatted as "Updated X hours ago" |
| Key reasons | `projectionData.reasoning[]` rendered as dot-separated line |
| Service & model badge | `projectionData.service` + `projectionData.model` |
| Stale warning banner | Shown when `isStale === true` |

#### New: `src/components/dashboard/ForecastSettingsModal.tsx`
Modal overlay with two sections:

**Section 1 — AI Provider:**
- Radio-style selector: Claude / OpenAI (highlighted active state)
- Model selector per service: hardcoded list as styled pills
- "Apply & Refresh" button — calls `refresh(service, model)`, closes modal

**Section 2 — Saved Forecasts:**
- List of up to 5 snapshot cards (name, coin, service, date)
- Click card → calls `snapshots.load(id)`, updates chart
- Inline name editing on click
- Delete icon per card
- Disabled "Save snapshot" state with message when 5 snapshots exist

---

### 2.9 Files to Remove / Clean Up

| File | Action |
|---|---|
| `src/scripts/daily-analysis.ts` | Delete — replaced by on-demand ISR Route Handler |
| Supabase calls in `src/app/api/projections/route.ts` | Rewrite — projections no longer use Supabase |

`src/lib/supabaseClient.ts` and `src/app/api/signals/route.ts` are **retained** — signals still use Supabase.

> **Note:** `daily-analysis.ts` also writes to the signals table. On deletion, signals will stop auto-updating (they will fall back to mock data). Signals pipeline should be addressed in a separate task.

---

## 3. Impact and Risk Analysis

**System Dependencies:**
- Removing Supabase from projections does not affect the signals pipeline
- `useProjections` now depends on `useForecastSettings` — settings must be read before the first SWR fetch key is constructed; both hooks should be called at the top of `ProjectionsPage`
- `unstable_cache` is a Next.js server-only API — cannot be called from client components

**Potential Risks & Mitigations:**

| Risk | Mitigation |
|---|---|
| AI call takes 3–8s on cold ISR miss | `unstable_cache` serialises concurrent requests — only one triggers the real AI call; others wait for the result. Cap `max_tokens` to limit latency. |
| User sees blank chart on very first load (no cache yet) | Skeleton loading state (specced in FR 2.4). Seeded fallback `PROJ` in `charts.tsx` remains as last resort. |
| OpenAI response format differs from Claude tool-use | Provider modules in `src/lib/forecast/` are isolated — each handles its own SDK parsing and maps to the shared `ProjectionData[]` output contract. |
| IndexedDB unavailable (private browsing / some mobile) | `useForecastSnapshots` wraps all IDB calls in try/catch; disables snapshot UI gracefully if unavailable. |
| Malicious or invalid service/model params on refresh endpoint | Server-side allowlist validates against the hardcoded model list; unknown values fall back to `claude` / `claude-sonnet-4-6`. |
| `revalidateTag` not available in client context | Only called inside the POST Route Handler — valid. Never called from a client component. |

---

## 4. Testing Strategy

- **Unit:** `generateForecast()` in both provider modules — mock SDK calls, assert output always conforms to `ProjectionData[]` with all required fields present
- **Unit:** `useForecastSettings` — test read/write with mock `localStorage`
- **Unit:** `useForecastSnapshots` — test CRUD with `fake-indexeddb` library or in-memory mock
- **Integration:** `GET /api/projections` with `NEXT_PUBLIC_USE_MOCK_DATA=true` — assert seeded mock data returned, no real AI call made
- **Integration:** `POST /api/projections/refresh` — assert `revalidateTag` is called and fresh data is returned
- **Manual E2E:**
  1. Open projections page → verify BTC forecast loads with confidence score, reasoning, and timestamp
  2. Switch coin tabs (ETH, SOL) → verify all context panel fields update per coin
  3. Click "Refresh forecast" → verify button enters loading state, then timestamp updates
  4. Open settings modal → switch to OpenAI / GPT-4o → click "Apply & Refresh" → verify service label in context panel changes to "OpenAI GPT-4o"
  5. Click "Save snapshot", enter name → verify it appears in settings modal saved list
  6. Add 5 snapshots → verify "Save snapshot" button is disabled with correct message
  7. Click a saved snapshot → verify chart and context panel reflect that snapshot's data
  8. Rename and delete a snapshot → verify list updates correctly
