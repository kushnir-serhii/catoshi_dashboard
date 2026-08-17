# Technical Specification: Real-Time Chart Ticker

- **Functional Specification:** [context/spec/007-real-time-chart-ticker/functional-spec.md](../functional-spec.md)
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

`HistoricalPriceChart` is a self-contained component with no props, managing its own coin selection via `localStorage`. The feature is implemented by adding a `useBinanceTicker` hook (new) that opens a direct browser WebSocket to Binance's `aggTrade` stream, and modifying `HistoricalPriceChart` to consume the hook and render a right-edge price label using the existing Recharts `Customized` overlay pattern already established in `src/components/dashboard/charts.tsx`.

No Route Handler or server-side changes are required — per the architecture, the Binance WebSocket is a direct browser connection.

**Affected files:**
- New: `src/hooks/useBinanceTicker.ts`
- Modified: `src/components/dashboard/HistoricalPriceChart.tsx`
- Modified: `src/consts/prices.ts` (one new constant)

---

## 2. Proposed Solution & Implementation Plan

### 2.1 New Constant: `BINANCE_TICKER_SYMBOLS`

Added to `src/consts/prices.ts`.

A partial map from CoinGecko coin ID (the value stored in `catoshi:chart-prefs`) to the lowercase Binance stream symbol:

| CoinGecko ID | Binance symbol |
|---|---|
| `bitcoin` | `btcusdt` |
| `ethereum` | `ethusdt` |
| `solana` | `solusdt` |

Type: `Readonly<Record<string, string>>` — only the three supported coins are present. A lookup returns `undefined` for any unsupported coin, which the hook treats as "don't connect."

---

### 2.2 New Hook: `useBinanceTicker`

**File:** `src/hooks/useBinanceTicker.ts`

**Input:** `symbol: string | null` — the Binance stream symbol (e.g. `'btcusdt'`). `null` means "don't connect."

**WebSocket endpoint:** `wss://stream.binance.com:9443/ws/{symbol}@aggTrade`

The `aggTrade` stream pushes a message on every aggregated trade. The current price is the `p` (price) field.

**Throttling:** `aggTrade` can fire dozens of times per second for BTC. To prevent excessive React re-renders, the hook uses a `useRef` for the raw incoming price and only flushes it into React state at most once per **100ms** (using `Date.now()` comparison). This gives ~10 label updates per second — smooth and visually real-time, without hammering the renderer.

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `price` | `number \| null` | Latest throttled price; `null` until first tick |
| `prevPrice` | `number \| null` | Price from the previous state update (for direction comparison) |
| `isConnected` | `boolean` | WebSocket is open and receiving |
| `isReconnecting` | `boolean` | Connection lost, auto-reconnect pending |

**Lifecycle:**

| Event | Action |
|---|---|
| `symbol` changes | Close existing socket, cancel pending reconnect timer, open new socket |
| `onopen` | `isConnected = true`, `isReconnecting = false` |
| `onmessage` | Parse `p` field → throttle → update `price` / `prevPrice` state |
| `onclose` / `onerror` | `isConnected = false`, `isReconnecting = true`, schedule reconnect after 3 seconds |
| Reconnect fires | Open new socket to same `symbol` |
| Unmount | Close socket, cancel timer |

**Mock guard:** When `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`, return `{ price: null, prevPrice: null, isConnected: false, isReconnecting: false }` immediately — no WebSocket attempt.

---

### 2.3 `HistoricalPriceChart` Changes

**File:** `src/components/dashboard/HistoricalPriceChart.tsx`

#### Binance symbol derivation
```
binanceSymbol = BINANCE_TICKER_SYMBOLS[prefs.coinId] ?? null
```
This is `null` for any coin not in the map, which causes `useBinanceTicker` to stay disconnected.

#### Hook call
```
const { price: livePrice, prevPrice, isConnected, isReconnecting } = useBinanceTicker(binanceSymbol)
```

#### Y-axis domain expansion
The chart's Y domain is currently derived from the min/max of historical price data with padding. When `livePrice` is defined, it is included in the domain calculation:
```
yMin = Math.min(historicalMin, livePrice) * 0.98
yMax = Math.max(historicalMax, livePrice) * 1.02
```
This ensures the live price label is always within the visible chart area.

#### Flash color state
```
flashColor: 'green' | 'red' | null   (useState, initialised null)
```
When `livePrice` changes and `prevPrice` is available:
- `livePrice > prevPrice` → set `flashColor = 'green'`, clear after 600ms
- `livePrice < prevPrice` → set `flashColor = 'red'`, clear after 600ms
- Equal prices → no flash

Color values: `#22c55e` (green) / `#ef4444` (red) / `var(--text-1)` (neutral) — matching the existing `SparklineChart` color convention.

#### Live price overlay — Recharts `Customized` component
A new `LivePriceOverlay` sub-component (defined in the same file) is added inside `<AreaChart>` as `<Customized component={LivePriceOverlay} />`, following the existing pattern in `charts.tsx`.

`LivePriceOverlay` receives Recharts' computed chart layout props and renders an SVG group:

1. **Dashed reference line** — a horizontal `<line>` element spanning the full plot width at the Y pixel coordinate of `livePrice`, stroked with the current `flashColor` (or neutral), dashed (`strokeDasharray="4 3"`).
2. **Price label box** — a filled `<rect>` + `<text>` group on the right edge of the plot area:
   - Background rect: `flashColor` fill (or neutral), ~6px rounded corners
   - Text: formatted USD price (same `formatPrice` function used elsewhere), white fill
   - Positioned at `x = plotRight`, `y = yPixel(livePrice)`
3. **"Reconnecting…" indicator** — when `isReconnecting === true`, a small `<text>` element rendered below the price label in `var(--warning)` color.

When `livePrice` is `null` (not yet connected, or unsupported coin), `LivePriceOverlay` renders nothing (`null`).

---

## 3. Impact and Risk Analysis

### System Dependencies
- `HistoricalPriceChart` is used only on the Markets page — scope is narrow.
- `useBinanceTicker` has no dependencies on other project hooks or API routes.
- The `catoshi:chart-prefs` localStorage key is read-only from this feature's perspective — no writes added.

### Potential Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `aggTrade` extremely high frequency causing UI jank on BTC | Medium | 100ms throttle caps state updates at ~10/sec regardless of trade frequency |
| Binance WebSocket unavailable / rate-limited | Low | `isReconnecting` indicator keeps user informed; 3s auto-reconnect; mock guard covers dev |
| Live price outside historical Y range making label invisible | Low | Y-domain expansion (§2.3) always keeps `livePrice` within chart bounds |
| Stale closure capturing old `symbol` in reconnect timer | Low | Reconnect timer refs the symbol via closure captured at connection time; symbol change cancels and restarts the whole cycle |
| Memory leak from uncleaned timers/sockets on unmount | Low | `useEffect` cleanup closes socket and clears `setTimeout` reference on every unmount and symbol change |

---

## 4. Testing Strategy

- **`useBinanceTicker` — connection lifecycle:** Mock the global `WebSocket` class; verify connect on non-null symbol, disconnect + reconnect on `onclose`, no-op on `symbol = null`, mock guard returns all-null/false.
- **`useBinanceTicker` — throttling:** Fire 20 rapid `onmessage` events within 100ms; verify `price` state updates at most twice (start + one throttled update).
- **`useBinanceTicker` — direction:** Verify `prevPrice` is the value from the previous throttled update, not the previous raw trade.
- **Flash logic:** Verify `flashColor` transitions `null → 'green' → null` on uptick and `null → 'red' → null` on downtick; verify it stays `null` on equal prices.
- **`LivePriceOverlay`:** Renders null when `livePrice = null`; renders label at correct Y pixel position when price is within domain; "Reconnecting…" text visible only when `isReconnecting = true`.
- **Y-domain expansion:** Verify `yMax` is adjusted when `livePrice > historicalMax`.
