# Technical Specification: Real Watchlist With Live Data

- **Functional Specification:** `context/spec/021-real-watchlist-live-data/functional-spec.md`
- **Status:** Completed
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Client-only change plus one query parameter on an existing Route Handler. No database
migration, no new external data source, no new model call, no new dependency.

`GET /api/markets` already returns `current_price`, `price_change_percentage_24h`,
`image` and `sparkline_in_7d.price` from a single CoinGecko `/coins/markets` request,
and `MarketsPage` already renders that sparkline through `SparklineChart`. The
watchlist needs exactly this payload for a user-chosen set of coins rather than the top
10 by market cap, so the handler gains an optional `?ids=` parameter and the hook gains
an optional argument.

The projection half needs no new fetch at all. `ProjectionsPage` already holds
`projections` from `useProjections`, and `AIPanel` already derives a projected
percentage and a confidence bar from a `ProjectionData` and renders `Not forecasted`
when there is none. That derivation is extracted into one tested pure helper and shared
by both panels.

The coin list itself is browser state: a new `useWatchlist` hook over a versioned
`localStorage` key, following the SSR-safe lazy-initialiser pattern already used for
chart preferences (architecture §8).

Finally, `src/data/projections.ts`'s `watchlistRows`, the `WatchlistRow` type, and the
seeded-random `Sparkline` usage in the panel are deleted.

**Scope note.** The functional spec covers the watchlist only. During analysis the user
asked to also address the Markets summary cards. Investigation found those cards carry
**no** fabricated sparkline — `mapPricesToKpis` never sets `sparkSeed`, so in live mode
the cards render no trend line at all. Section 2.8 therefore adds real 7-day sparklines
to those cards from data already fetched on that page. This is an enhancement, not a
fake-data removal, and it is called out separately so it can be dropped without
affecting the rest.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 API Contract: `GET /api/markets`

One optional parameter. Default behaviour is byte-identical to today, so `MarketsPage`
needs no change.

| Parameter | Type | Default | Behaviour |
|---|---|---|---|
| `ids` | comma-separated CoinGecko ids | absent | When absent: current behaviour — top `MARKETS_PAGE_SIZE` by `market_cap_desc`. When present: upstream call adds `&ids=<list>` and drops `order`/`per_page`/`page`. |

Response shape is unchanged: `MarketListItem[]`.

Rules:

- Ids are split on comma, trimmed, lowercased, de-duplicated, and empties dropped.
- More than `WATCHLIST_MAX_COINS` ids → `400`. This is the server-side guard behind the
  UI's 10-row limit; the URL is user-controllable and must not be a way to fan out an
  arbitrarily large upstream request.
- An id CoinGecko does not know is simply absent from the upstream array. The handler
  does not synthesise a row for it — an unknown coin must not become a row of zeroes
  (functional spec 2.7). The client renders only the ids it got back.
- Ordering: the response is re-ordered to match the requested `ids` order, so the strip
  shows rows in the order the user added them (functional spec, Out-of-Scope: no sorting).
- Caching stays `next: { revalidate: 60 }`. Distinct id sets are distinct URLs and so
  distinct cache entries, which is correct.
- Mock mode: the existing `MOCK_MARKETS` array is filtered by the requested ids.

### 2.2 Hook: `useMarkets(ids?: string[])`

`src/hooks/useMarkets.ts` gains an optional argument.

- SWR key becomes the request URL, so it already varies per id set. Today's key
  `'/api/markets'` is preserved exactly when no ids are passed.
- `keepPreviousData: true` stays, so adding a coin does not blank the existing rows.
- `refreshInterval`, `isLoading`, `isStale` and `countdown` semantics are unchanged.
- Passing an empty array must **not** fetch. The hook passes a `null` SWR key in that
  case, which is the empty-watchlist state (functional spec 2.3).

### 2.3 Hook: `useWatchlist()`

New file `src/hooks/useWatchlist.ts`.

| Concern | Decision |
|---|---|
| Storage key | `catoshi:watchlist` |
| Stored shape | `{ v: number; coins: Array<{ id: string; symbol: string; name: string }> }` |
| Default | the three ids from `DEFAULT_FORECAST_TARGETS` |
| Max | `WATCHLIST_MAX_COINS` (10) |
| Read | lazy `useState` initialiser, guarded on `typeof window`, wrapped in try/catch |
| Write | on every mutation, try/catch, failure is non-fatal |
| Version mismatch or parse failure | fall back to the default list, matching the forecast-settings and chart-prefs convention |

Returned surface: `{ coins, ids, add, remove, isFull }`.

Symbol and name are stored alongside the id so a row can render its label before the
first market response arrives, which is what makes the per-row placeholder in functional
spec 2.5 possible. `add` is a no-op when the id is already present or the list is full;
duplicates are impossible by construction.

### 2.4 Shared Helper: Projected Change and Confidence

New file `src/lib/projectionSummary.ts`, extracted from the logic currently inline in
`AIPanel.tsx`.

```
summariseProjection(projection: ProjectionData | null, horizonDays: number)
  → { deltaPct: number; confidence: number } | null
```

- Returns `null` when there is no projection, or when `currentPrice <= 0`. `null` is the
  single source of the dash and the empty confidence bar in both panels.
- `deltaPct` is derived from `interpolateAt(projection.base, horizonDays)` against
  `projection.currentPrice`, which is what `AIPanel` does today.
- Pure, no React, no fetch. Unit-tested per §4.

`AIPanel.tsx` is refactored onto this helper in the same change, so the two panels can
never disagree about the same coin (functional spec 2.2 acceptance criterion).

Matching a market row to a projection is by uppercase symbol, since `ProjectionData.coin`
is a symbol and `MarketListItem.symbol` is lowercase — the same lookup `AIPanel` performs.

### 2.5 Component: `WatchlistPanel`

`src/components/panels/WatchlistPanel.tsx` is rewritten. Its props change from
`rows: WatchlistRow[]` to the live inputs.

| Concern | Implementation |
|---|---|
| Rows | one per entry from `useWatchlist`, in list order |
| Price, 24h change | from the matching `MarketListItem` |
| Trend | `SparklineChart` with `prices={sparkline_in_7d.price}`, `isPositive` computed last-vs-first, identical to the Markets table |
| Projection, confidence | `summariseProjection(...)`; `null` renders a dash with a `title` attribute explaining the coin is not forecast, and an empty bar |
| Loading | `isLoading` from `useMarkets` renders one animated placeholder row per watchlist entry, reusing the pulse classes already used by `KPIs` |
| Per-row loading | an entry with no matching market row yet renders as a placeholder row, not as a zero row |
| Stale | `isStale` renders the warning strip in the panel footer, matching the `KPIs` footer treatment, alongside the countdown |
| Header | title becomes `Watchlist`; the `60-day projection` wording is removed |
| Empty list | a short line inviting the user to add a coin, in place of the table |
| `Manage list` | opens the modal in §2.6 |

The freshness line uses the same `countdown` and stale wording as `KPIs`, so it is the
true age of the displayed prices rather than render time. This is the regression guarded
in `src/lib/freshness.ts`'s header comment.

`ProjectionsPage` wires it: `const watchlist = useWatchlist()`, then
`useMarkets(watchlist.ids)`, passing that plus the `projections` it already holds.

### 2.6 Component: `WatchlistManageModal`

New file `src/components/dashboard/WatchlistManageModal.tsx`, patterned on
`ForecastSettingsModal.tsx`.

- Coin picking reuses `src/components/ui/CoinSelect.tsx`, which is already the search
  dropdown over `useCoinSearch` used by the chart. No new search code.
- Lists current coins with a remove control on each.
- When `isFull`, the picker is disabled with a short line stating the 10-coin limit.
- Selecting a coin already on the list is a no-op with a brief note rather than an error.

### 2.7 Deletions

| File | Change |
|---|---|
| `src/data/projections.ts` | remove `watchlistRows` |
| `src/data/types.ts` | remove `WatchlistRow` |
| `src/components/panels/WatchlistPanel.tsx` | remove the seeded `Sparkline` usage and the inline `proj-bar` percentage arithmetic |

The seeded `Sparkline` in `src/components/dashboard/charts.tsx` stays, because
`LandingPage.tsx` still uses it decoratively. That remaining use is noted in §3 as a
follow-up rather than removed here.

### 2.8 Markets Summary Cards (added scope)

The live KPI cards currently render no trend line, because `mapPricesToKpis` in
`MarketsPage.tsx` does not set `sparkSeed`.

- `KpiItem` gains `sparkline?: number[]` and `sparkSeed`/`sparkColor` are removed.
- `KPIs.tsx` renders `SparklineChart` when `sparkline` is present and non-empty, and
  nothing when it is absent. No seeded fallback.
- `LiveMarketsContent` already calls `useMarkets()` beside `usePrices(...)`, so the
  7-day series is joined onto each card by symbol with no extra request.
- The mock `marketKpis` in `src/data/markets.ts` is left without sparklines, so mock mode
  simply shows no trend line rather than a fabricated one.
- `LandingPage.tsx` keeps its seeded `Sparkline` and is untouched.

### 2.9 Constants

Per the project's constants rule, new shared values go in `src/consts/`.

| Constant | File | Value | Used by |
|---|---|---|---|
| `WATCHLIST_MAX_COINS` | `src/consts/prices.ts` | `10` | markets route guard, `useWatchlist`, modal |
| `WATCHLIST_STORAGE_KEY` | `src/consts/prices.ts` | `catoshi:watchlist` | `useWatchlist` |
| `WATCHLIST_STORAGE_VERSION` | `src/consts/prices.ts` | `1` | `useWatchlist` |
| `WATCHLIST_HORIZON_DAYS` | `src/consts/projections.ts` | reuse the existing forecast horizon constant | `summariseProjection` callers |

`DEFAULT_FORECAST_TARGETS` is reused as the default list rather than a new literal, so
the strip's starting coins and the forecast targets can never drift apart.

---

## 3. Impact and Risk Analysis

### System Dependencies

- **`/api/markets`** is shared with `MarketsPage`. The no-parameter path must stay
  identical; this is the main regression surface.
- **`AIPanel`** is refactored onto the new helper. Its rendered output must not change.
- **`useProjections`** is read-only here. Nothing in this change may cause a forecast to
  be generated, which is the spec 019 cost-control invariant.
- **CoinGecko rate limits.** The strip adds one more `/coins/markets` request per
  60-second tick per viewer, on a different cache key from the Markets page.

### Potential Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A user-supplied `ids` list fans out a huge upstream request | Hard `400` above `WATCHLIST_MAX_COINS`, enforced in the handler, not only in the UI |
| An unknown or delisted coin id yields a row of zeroes, which is exactly the fabricated number this spec removes | The handler never synthesises rows; the client renders only ids present in the response, and an entry with no row shows a placeholder |
| Doubling the market request cadence trips CoinGecko's free-tier limit | Both calls share the 60-second `revalidate` window, so cost is per cache key, not per viewer; if it becomes a problem the watchlist can be served from the top-10 response when its ids are a subset |
| Storage unavailable (private browsing, blocked site data) | Every read and write is in try/catch; the strip falls back to the default three coins for the session |
| A stale stored list references a coin CoinGecko no longer serves | Row renders as a placeholder indefinitely rather than as data; the user can remove it. Accepted, not silently pruned, since silent pruning would surprise the user |
| Extracting the shared helper silently changes what the AI panel displays | The helper is a pure move of existing arithmetic, covered by unit tests before the refactor lands |
| Rows shift as coins are added, moving the panel's height in the dashboard grid | The 10-coin cap bounds it; the panel scrolls inside its existing `tbl-wrap` |

### Known Remaining Fabrications (out of scope, recorded)

- `panelSignals` in `src/data/projections.ts` still feeds a fixed signals list into
  `SignalsPanel` on this same screen, while `/api/signals` serves real stored rows.
- `LandingPage.tsx` renders seeded-random sparklines as decoration.

Both belong to Phase 3's `Stop Showing Unmeasured Numbers` and should become their own
spec rather than being folded in here.

---

## 4. Testing Strategy

No test runner is configured; the project's convention is standalone `npx tsx` scripts
under `src/scripts/` (as in `scoring.test.ts` and `price-context.test.ts`). Type checking
is `npx tsc --noEmit`.

**Unit, `src/scripts/watchlist.test.ts`:**

- `summariseProjection` returns `null` for a missing projection and for
  `currentPrice <= 0`, and the expected percentage for a known base curve.
- The id parser: trimming, lowercasing, de-duplication, empty rejection, and the
  over-limit rejection.
- Response re-ordering matches requested id order, and an id missing upstream is absent
  rather than zero-filled.
- `useWatchlist`'s pure reducer functions: add, remove, duplicate no-op, cap, and
  recovery from a corrupt or version-mismatched stored value.

**Manual, against the acceptance criteria in the functional spec:**

- Default three coins on a cleared browser profile; add a coin; reload; the list persists.
- The added coin shows a dash under Projection with the hover explanation.
- Bitcoin's price on the strip matches the Markets page price at the same moment.
- Open the screen repeatedly and confirm no forecast is generated, checking the stored
  forecast count is unchanged.
- Markets page renders identically to before with no `ids` parameter.
- Offline: placeholders or the stale warning, never numbers.
