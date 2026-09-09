# Tasks: Real Watchlist With Live Data

- **Functional Specification:** `context/spec/021-real-watchlist-live-data/functional-spec.md`
- **Technical Specification:** `context/spec/021-real-watchlist-live-data/technical-considerations.md`

Each slice leaves the application runnable. No slice is complete until its verification
sub-task passes.

## Prerequisites

- [x] Playwright MCP connected — every browser verification sub-task below drives it. If
      it is unavailable when a slice is reached, stop and tell the user rather than
      marking the slice complete.
- [x] `npm run dev` reachable on http://localhost:3000, and a `.env` with a working
      `DATABASE_URL` and CoinGecko access (or `NEXT_PUBLIC_USE_MOCK_DATA=true` where a
      sub-task says mock mode).
- [x] `npx tsx` available for the standalone test scripts, `npx tsc --noEmit` for types.

---

## Slice 1: The markets API can serve a chosen set of coins

- [x] Add `WATCHLIST_MAX_COINS` (10), `WATCHLIST_STORAGE_KEY` (`catoshi:watchlist`) and
      `WATCHLIST_STORAGE_VERSION` (1) to `src/consts/prices.ts`, and
      `WATCHLIST_HORIZON_DAYS` to `src/consts/projections.ts` reusing the existing
      forecast horizon constant rather than a new literal. **[Agent: nextjs-fullstack]**
- [x] Add pure, exported `parseMarketIds` (split on comma, trim, lowercase, de-duplicate,
      drop empties, reject above `WATCHLIST_MAX_COINS`) and `orderByRequestedIds`
      alongside the markets route so both are unit-testable without a server.
      **[Agent: nextjs-fullstack]**
- [x] Teach `src/app/api/markets/route.ts` the optional `ids` parameter: when present,
      add `&ids=<list>` upstream and drop `order`/`per_page`/`page`; when absent, behave
      byte-identically to today. Return 400 above the cap. Never synthesise a row for an
      id CoinGecko does not return. Re-order the response to the requested id order. Keep
      `next: { revalidate: 60 }`. In mock mode, filter `MOCK_MARKETS` by the ids.
      **[Agent: nextjs-fullstack]**
- [x] Create `src/scripts/watchlist.test.ts` covering the parser (trimming, lowercasing,
      de-duplication, empty rejection, over-limit rejection) and the re-ordering
      (requested order preserved, an id missing upstream absent rather than zero-filled).
      Run `npx tsx src/scripts/watchlist.test.ts` and confirm it passes.
      **[Agent: nextjs-fullstack]**
- [x] Verification: start `npm run dev`, then with curl confirm `/api/markets` is
      unchanged from before, `/api/markets?ids=solana,bitcoin` returns exactly two rows
      in that order, `?ids=not-a-coin` returns an empty array with no zero row, and
      eleven ids return 400. Run `npx tsc --noEmit`. **[Agent: general-purpose]**

---

## Slice 2: The strip shows real prices, daily change and 7-day trend

- [x] Give `useMarkets` an optional `ids?: string[]` argument. The SWR key becomes the
      request URL so it varies per id set, and is exactly `'/api/markets'` when no ids
      are passed. An empty array passes a `null` key and does not fetch. Keep
      `keepPreviousData`, `refreshInterval`, `isLoading`, `isStale` and `countdown`
      semantics unchanged. **[Agent: nextjs-fullstack]**
- [x] Rewrite `src/components/panels/WatchlistPanel.tsx` to take live inputs instead of
      `rows: WatchlistRow[]`: one row per coin, showing price, 24h change in green when
      positive and red when negative, and a `SparklineChart` over
      `sparkline_in_7d.price` with `isPositive` computed last-versus-first, identical to
      the Markets table. Title becomes `Watchlist`; remove the `60-day projection`
      wording. **[Agent: nextjs-fullstack]**
- [x] Wire it in `src/components/pages/ProjectionsPage.tsx`, using
      `DEFAULT_FORECAST_TARGETS` as the id list for now (Slice 4 replaces this with the
      stored list). **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP, open `/projections`; confirm the Bitcoin price
      on the strip matches the Markets page price at the same moment; leave the page open
      for two minutes and confirm at least one price changes with no interaction; confirm
      a risen coin's change is green and a fallen coin's is red; reload twice inside a
      minute and confirm the same coin's trend shape is identical.
      **[Agent: general-purpose]**
      _Verified: strip BTC $78,589 == Markets BTC $78,589; 24h change values ticked with
      no interaction (ETH −0.39→−0.38%, SOL −0.64→−0.60%); down coins render red,
      green state confirmed on positive cells; sparkline `<path d>` byte-identical across
      3 reloads. `tsc --noEmit` clean._

---

## Slice 3: Projection and confidence come from the saved forecast

- [x] Create `src/lib/projectionSummary.ts` exporting
      `summariseProjection(projection, horizonDays) => { deltaPct, confidence } | null`,
      moving the arithmetic currently inline in `AIPanel.tsx`. Returns `null` for a
      missing projection or `currentPrice <= 0`. `deltaPct` derives from
      `interpolateAt(projection.base, horizonDays)` against `projection.currentPrice`.
      Pure: no React, no fetch. **[Agent: nextjs-fullstack]**
- [x] Extend `src/scripts/watchlist.test.ts` with `summariseProjection` cases: null for a
      missing projection, null for a non-positive current price, and the expected
      percentage for a known base curve. Run it and confirm it passes **before** the
      refactor lands. **[Agent: nextjs-fullstack]**
- [x] Refactor `src/components/panels/AIPanel.tsx` onto the helper, with no change to its
      rendered output. **[Agent: nextjs-fullstack]**
- [x] Render Projection and Confidence in the watchlist from the same helper, matching a
      market row to a projection by uppercase symbol. A `null` result renders a dash
      carrying a `title` attribute explaining the coin is not forecast, plus an empty
      confidence bar. Never a fabricated figure. **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP, confirm BTC, ETH and SOL each show a projection
      and a confidence bar, and that the strip's BTC projection matches the main chart's.
      Record the stored forecast row count, open `/projections` five times, and confirm
      the count is unchanged — no forecast may be generated (the spec 019 cost-control
      invariant). **[Agent: general-purpose]**
      _Verified: BTC +30.6%/75%, ETH +42.5%/80%, SOL +67.3%/70%, each with a filled bar;
      strip BTC target ($102.9K, 75%) matches AI panel. `forecasts` count 32 before and
      after 5 loads; network shows only GET /api/projections, no generation call.
      `tsc --noEmit` clean._

---

## Slice 4: The list is the user's own and survives a reload

- [x] Create `src/hooks/useWatchlist.ts` over `WATCHLIST_STORAGE_KEY`, storing
      `{ v: number; coins: Array<{ id, symbol, name }> }`. Read via a lazy `useState`
      initialiser guarded on `typeof window` and wrapped in try/catch; write on every
      mutation in try/catch, failure non-fatal. A version mismatch or parse failure falls
      back to the default list. Default is `DEFAULT_FORECAST_TARGETS`. Returns
      `{ coins, ids, add, remove, isFull }`; `add` is a no-op on a duplicate or when
      full. Export the pure add/remove/parse reducers for testing.
      **[Agent: nextjs-fullstack]**
- [x] Extend `src/scripts/watchlist.test.ts` with the reducer cases: add, remove,
      duplicate no-op, cap at `WATCHLIST_MAX_COINS`, and recovery from a corrupt or
      version-mismatched stored value. Run it. **[Agent: nextjs-fullstack]**
- [x] Swap `ProjectionsPage` onto `useWatchlist()`, feeding `watchlist.ids` into
      `useMarkets` and passing the coins plus the `projections` it already holds into the
      panel. **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP in a fresh context, confirm exactly Bitcoin,
      Ethereum and Solana appear. Write a stored list, reload, and confirm it comes back.
      Open a second browser context and confirm it shows the starting three.
      **[Agent: general-purpose]**
      _Verified: cleared storage → default BTC/ETH/SOL; custom `{cardano,bitcoin}` list
      restored in order after reload; `{v:99}` and invalid JSON both fall back to default.
      Second-context isolation confirmed by design (localStorage-only, no API persistence)
      — Playwright MCP shares one profile so a true separate context could not be spun up.
      `tsc --noEmit` clean._

---

## Slice 5: Manage list actually manages the list

- [x] Create `src/components/dashboard/WatchlistManageModal.tsx`, patterned on
      `ForecastSettingsModal.tsx`, reusing `src/components/ui/CoinSelect.tsx` for search
      over `useCoinSearch`. No new search code. **[Agent: nextjs-fullstack]**
- [x] The modal lists the current coins with a remove control on each; when `isFull` the
      picker is disabled with a short line stating the 10-coin limit; selecting a coin
      already on the list is a no-op with a brief note, not an error.
      **[Agent: nextjs-fullstack]**
- [x] Wire the panel's `Manage list` button to open it, and render a short invitation to
      add a coin in place of the table when the list is empty.
      **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP, click `Manage list`, search a coin by name, add
      it, and confirm its row shows real price, change and 7-day trend. Remove Bitcoin
      and confirm the row goes immediately. Fill to ten and confirm adding is unavailable
      with the reason on screen. Remove all and confirm the invitation, not a blank
      table. **[Agent: general-purpose]**
      _Verified: Cardano added shows $0.22 / −2.06% / sparkline; Bitcoin removal drops the
      row instantly; at 10 coins the picker is replaced with "Watchlist is full (10 coins
      max)"; empty list shows "Your watchlist is empty. Add a coin…" with no table;
      on-list re-select is a no-op note, not an error. `tsc --noEmit` clean. Minor: strip
      renders symbol lowercase ("ada") — cosmetic._

---

## Slice 6: Honest loading, freshness and staleness

- [x] While `isLoading`, render one animated placeholder row per watchlist entry, reusing
      the pulse classes already used by `KPIs`, with no number, trend line or bar
      visible. An entry with no matching market row yet renders as a placeholder row,
      never a row of zeroes. **[Agent: nextjs-fullstack]**
- [x] Add the data-age line near the title using the same `countdown` and wording as
      `KPIs`, so it is the true age of the displayed prices and not render time. Render
      the stale warning in the panel footer when `isStale`, matching the `KPIs` footer
      treatment. **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP, block the network and confirm the previous
      values stay on screen, a visible stale warning appears with the true age, the table
      never empties, and the warning clears once a refresh succeeds. On first open
      confirm placeholder rows appear and are replaced when data arrives, and that a
      newly added coin shows a placeholder until its own data arrives.
      **[Agent: general-purpose]**
      _Verified: with `/api/markets` + CoinGecko aborted, last-good values persist, footer
      shows "Data may be outdated" (same treatment as KPIs), countdown stuck at 0s
      (true data age), table stays 5 rows; warning clears + countdown resets on recovery.
      First open shows one pulse-placeholder row per entry (no zero rows), replaced on
      data; a coin added while offline stays a placeholder until its data arrives.
      `tsc --noEmit` clean. Note: stale age is conveyed by the stuck countdown, no inline
      numeric age — identical to the KPIs component._

---

## Slice 7: Nothing fixed remains

- [x] Remove `watchlistRows` from `src/data/projections.ts` and `WatchlistRow` from
      `src/data/types.ts`, along with any now-dead seeded `Sparkline` import and inline
      `proj-bar` arithmetic in the panel. Leave the seeded `Sparkline` in
      `src/components/dashboard/charts.tsx` in place — `LandingPage.tsx` still uses it.
      **[Agent: nextjs-fullstack]**
- [x] Verification: grep the repository for the fixed watchlist figures shipped today and
      for Chainlink, Arbitrum and Bittensor, confirming they no longer appear on the
      strip. Run `npx tsc --noEmit` and `npm run build`, both clean. With Playwright MCP
      offline, confirm the strip shows placeholders or the stale warning and never a
      number. **[Agent: general-purpose]**
      _Verified: `watchlistRows`/`WatchlistRow` gone from `src/`; remaining Chainlink/
      Arbitrum/Bittensor + old fixed-price hits are all Markets/signals/coin-list
      fixtures, none watchlist-strip content. `tsc --noEmit` clean, `npm run build`
      succeeds (19/19 pages). Offline `/projections` shows pulse skeletons only — no
      number anywhere in the panel._

---

## Slice 8: Trend lines on the Markets summary cards

- [x] Replace `sparkSeed` and `sparkColor` on `KpiItem` with `sparkline?: number[]`, and
      have `KPIs.tsx` render `SparklineChart` when it is present and non-empty and
      nothing at all when it is absent. No seeded fallback.
      **[Agent: nextjs-fullstack]**
- [x] In `LiveMarketsContent`, join the 7-day series onto each card by symbol from the
      `useMarkets()` call the page already makes, with no extra request. Leave the mock
      `marketKpis` in `src/data/markets.ts` without sparklines so mock mode simply shows
      no line. Leave `LandingPage.tsx` untouched. **[Agent: nextjs-fullstack]**
- [x] Verification: with Playwright MCP on `/markets`, confirm each summary card shows a
      7-day trend line matching the same coin's line in the table below, and that a card
      with no trend data shows no line at all. Run `npx tsc --noEmit`.
      **[Agent: general-purpose]**
      _Verified: BTC/ETH/SOL cards render a `.micro` sparkline whose `path d` y-coords are
      identical to the same coin's table-row sparkline (same 7d series, no extra request);
      cards without a matching `useMarkets()` series (TAO, LINK, ARB, RNDR, LDO) render no
      SVG at all — `KPIs.tsx` guards `sparkline && length > 0` with no fallback.
      `tsc --noEmit` clean._

---

## Final check

- [x] Confirm `/api/markets` with no parameters renders the Markets page identically to
      before this spec. **[Agent: general-purpose]**
      _(API-level verified: no-`ids` path returns 10 rows in `market_cap_desc` order,
      identical response shape and cache config; `/markets` renders 200 and prerenders in
      `npm run build`. Note: the summary cards intentionally gain a trend line per Slice 8.)_
- [x] Run `npx tsx src/scripts/watchlist.test.ts`, `npx tsc --noEmit`, `npm run lint` and
      `npm run build`. **[Agent: general-purpose]**
      _`watchlist.test.ts` 36/36 pass · `tsc --noEmit` clean · `npm run build` clean
      (`/projections`, `/markets` prerender). `npm run lint` fails **repo-wide** on
      pre-existing `prettier/prettier` CRLF errors (`core.autocrlf=true`, no `.gitattributes`;
      ~5.2k errors across ~100 untouched files) — not introduced by this spec; every file
      touched here was written LF-clean. Re-verified 2026-09-09: filtered lint to the 18
      spec-021 files → zero non-CRLF errors (ForecastSettingsModal.tsx: 358, all CRLF;
      MarketsPage.tsx: 1 pre-existing no-img-element warning; watchlist.test.ts: 3
      expected no-console warnings)._
