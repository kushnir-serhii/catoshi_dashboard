# Tasks: Real-Time Chart Ticker

**Priority: lowest in the project.** Nothing depends on this — no other spec, no data
collection, no scoring. It is the last item on the roadmap (Phase 6, optional) and should be
started only when everything ahead of it is done or explicitly parked.

Written 02.09.2026 to complete the spec folder; the functional spec and technical
considerations date from earlier and were written against the old product scope. **Re-read
both before starting** and disregard any reference to portfolio or holdings surfaces, which
no longer exist (spec 016).

---

## Slice 1 — The connection, on its own

Isolate the WebSocket before any of it touches a chart.

- [ ] `src/hooks/useLivePrice.ts`: connect to the Binance combined stream for a single symbol, connect on mount, disconnect on unmount, expose `{ price, previousPrice, status }`.
- [ ] Symbols come from `src/consts/prices.ts` — the same BTC/ETH/SOL set the collector tracks. No inline symbol strings.
- [ ] Auto-reconnect with **exponential backoff and a cap**, not a fixed retry interval. A tight reconnect loop against a public endpoint is how an IP gets rate-limited.
- [ ] Unsubscribe and close cleanly on unmount and on symbol change — a leaked socket per navigation is the classic failure here.
- [ ] Unsupported symbol → the hook reports "unsupported" and opens no socket at all.
- [ ] Verify in the browser: navigate away and back ten times, confirm exactly one open socket.

**Done when:** the hook works in isolation and leaks nothing.

---

## Slice 2 — The label on the chart

- [ ] Price label pinned to the right edge of the chart at the current price level, in `HistoricalPriceChart.tsx` / `ChartPanel.tsx`.
- [ ] Follows the chart's selected asset; switching asset re-subscribes.
- [ ] No label at all when the selected asset is outside BTC/ETH/SOL — not an empty label, not a zero.
- [ ] Label formatting uses the existing price formatter. Do not add a second one.

---

## Slice 3 — Tick flash and connection state

- [ ] Green on an uptick, red on a downtick, returning to neutral in under one second.
- [ ] Flash duration in `src/consts/prices.ts`.
- [ ] On disconnect: the last known price stays visible and a subtle "Reconnecting…" indicator appears near the label. It must be clear the price is **last known**, not live — this product does not present stale data as current (`decisions.md` §3).
- [ ] On reconnect: the indicator clears and updates resume, with no user action.
- [ ] Respect `prefers-reduced-motion` — a colour change is fine, rapid flashing is not.

---

## Slice 4 — Verification and record

- [ ] Manual: throttle the network, kill the connection, and confirm the label degrades to last-known-with-indicator and recovers on its own.
- [ ] Confirm the ticker does not affect SWR polling, the collection run, or any other page.
- [ ] `npx tsc --noEmit` and `npm run lint` clean.
- [ ] `context/product/architecture.md` §2: confirm the streaming entry matches what shipped.
- [ ] Tick the Phase 6 checkbox in the roadmap; update `README.md` §3.

---

## Deliberately not in any slice

- Assets beyond BTC, ETH and SOL.
- Streaming into any surface other than the chart label.
- Persisting streamed prices. This is a display concern only — the snapshot store is the
  system of record, and a WebSocket feed must never become a second, unversioned one.
- Order book, trades or liquidation streams. Liquidations remain deferred for the reason in
  `decisions.md` §8, defect 7.
