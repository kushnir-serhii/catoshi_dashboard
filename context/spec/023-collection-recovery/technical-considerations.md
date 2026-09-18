# Technical Considerations: Collection Recovery

---

## 1. Evidence on record (2026-09-16)

Do not re-derive these; they were read from production logs and endpoints.

| Observation | Source |
|---|---|
| `snapshotBuilder: no daily klines for asset N at 2026-09-16T14:00:00.000Z — cannot derive price`, all three assets | Vercel function logs, manual `/api/collect` run |
| `/api/collect` → 502 after ~18 s | same run |
| `newestSnapshotTs` = `2026-09-02T08:00:00Z`, `snapshots24h: 0` | `GET /api/health` |
| `rss2json HTTP 422` for coindesk, cointelegraph, decrypt; `news:classify` and `news:publish` OK | same run |
| Daily closes **are** present in the DB (14 recent daily closes, 91 over 90 days, via `priceContext`) | `/api/projections/inputs` |
| `DATABASE_URL` was wrapped in quotes in Vercel → `getaddrinfo ENOTFOUND base`; fixed, DB reachable | Vercel logs, resolved |

The last row matters twice. The DB outage masked this failure for days, and it is the same
class of bug: **a value copied from `.env` into the Vercel UI keeps its quotes.** Before
blaming code, check `CRON_SECRET`, `COLLECT_ENDPOINT`, `FORECAST_INGEST_SECRET` and
`ADMIN_SECRET` for stray quotes. A quoted `CRON_SECRET` makes `/api/collect` 401 every hourly
Actions run while the daily Vercel cron (which injects the same var) also fails — cheap to
check, expensive to miss.

---

## 2. Why the reason is unknown

`fetchKlines` (the live path) is:

```ts
const res = await fetch(url);
if (!res.ok) return null;
```

The status is discarded at the only place it exists. Three hypotheses fit the evidence, and
Slice 1 exists to tell them apart rather than guess:

1. **Geo block.** `fapi.binance.com` refuses US-hosted requests (HTTP 451). `vercel.json` has
   no `regions` key, so functions run in Vercel's default `iad1` (Washington DC). Local dev
   runs from Poland and works — which is exactly why this never reproduced. This hypothesis
   also predicts that *every* timeframe is null, not only `1d`.
2. **Rate limit (429/418).** `fetchKlinesPage` (backfill) honours `Retry-After` and backs off;
   `fetchKlines` (live) does not retry at all. `fetchAllTimeframes` fires four requests at once
   per asset, and `buildSnapshot` adds funding + open interest + long/short ratio to the same
   burst. This hypothesis predicts *some* timeframes succeed and `1d` is unlucky.
3. **Malformed payload** — `isRawKline` rejects a row and the whole page is discarded.

Which one it is changes the fix completely. Do not write Slice 3 before Slice 1's number is in
`docs/runbook.md`.

---

## 3. The reporting bug beside it

In `buildSnapshot`:

```ts
const [klinesByTf, klinesStatus] = settle('klines', klinesResult);
```

`fetchAllTimeframes` never rejects — it resolves to an object whose values may all be `null`.
So `settle` reports `{ source: 'klines', ok: true }` for a fetch that returned nothing. The
per-timeframe `klines:1d` entries pushed inside `assembleSnapshot` are the only honest signal,
and they are only emitted when `klinesByTf` is non-null.

Fix: the `klines` status is `ok: false` when every `COLLECT_TIMEFRAMES` entry is null, with the
per-timeframe reasons in its `error`. This is what makes `/api/health` stop lying.

### 3.1 Worse: a throwing asset loses every source status it had

Confirmed against production `/api/health` on 2026-09-18 — the `collectors` array contains no
`klines:*`, `funding`, `openInterest`, `longShortRatio` or `fearGreed` row at all, only
`<SYMBOL>:snapshotBuilder`.

Cause, in `/api/collect`:

```ts
const { snapshot, sources } = await buildSnapshot(asset.symbol, hourTs);
sourcesBySymbol[asset.symbol] = sources;   // never reached when assembleSnapshot throws
...
} catch (error) {
  sourcesBySymbol[asset.symbol] = [
    ...(sourcesBySymbol[asset.symbol] ?? []),  // always `[]` here
    { source: 'snapshotBuilder', ok: false, error: message },
  ];
}
```

`assembleSnapshot` throws *inside* `buildSnapshot`, so the destructuring never happens and the
already-collected `sources` array is discarded with the stack. The catch then seeds the entry
from an `undefined` slot. The result is that the one failure mode that matters most — an asset
dying mid-build — is also the one that erases all its diagnostic output.

Fix with Slice 1: have `buildSnapshot` attach its accumulated `sources` to the thrown error (or
return a discriminated failure instead of throwing), and have the catch merge them. Without
this, Slice 1's new per-timeframe statuses will be collected and then thrown away exactly when
they are needed.

---

## 4. Price derivation

Today, in `assembleSnapshot`:

```ts
const latestPrice = closesDaily && closesDaily.length > 0 ? closesDaily.at(-1) : null;
```

Everything else in the snapshot tolerates a missing timeframe; the price does not. That single
coupling is what turns one failed fetch into a lost hour for all three assets.

The fallback order `1d → 4h → 1h → 15m` is chosen so the substitute is always *fresher* than
what it replaces, never staler. The price is a spot reading at `ts`; using the last 4h close
instead of the last daily close is a smaller error, not a bigger one.

What must **not** follow the price:

- `ma7Daily` / `ma25Daily` / `ma99Daily`, `atrDaily`, `volumeZDaily`, `structureDaily` stay
  `null` without daily candles. A 99-period MA over 4h candles is a different quantity with the
  same column name — that is how a scoring model silently learns nonsense.
- `pctFromMa*Daily` stays `null` when its MA is null (already the case).
- `volume24hUsd` is daily volume or `null`.

Record the source: `raw.priceSource = '1d' | '4h' | '1h' | '15m'`, plus a
`SourceStatus { source: 'price:fallback', ok: true, note: '<tf>' }` when it is not `1d`. A
snapshot whose price came from a substitute must be identifiable afterwards, because spec 011
scoring reads snapshot prices to resolve forecasts.

Point-in-time slicing (`sliceAt`) applies to the fallback series exactly as it does to daily —
use the already-sliced arrays, never the raw input, or the backfill regains a look-ahead bug.

---

## 5. Fallback source, if Slice 1 says geo or rate limit

Two options, in order of preference:

- **`vercel.json` `"regions": ["fra1"]`** — **now the preferred fix, and not only for 451.**
  Slice 0 (2026-09-18) established that the Neon project is `aws-eu-central-1` (Frankfurt) while
  `vercel.json` sets no `regions`, so functions run on Vercel's default `iad1` (Washington DC).
  Every DB query in the app currently crosses the Atlantic and back. The caution written here
  before Slice 0 — "moving the region trades one problem for a slower one" — was based on the
  unknown Neon region and is **void**: `fra1` removes a transatlantic round trip from every
  query *and* moves the egress IP out of the block range that `fapi.binance.com` refuses. It is
  a win on both axes, and worth doing on latency grounds even if Slice 1 returns 429 rather
  than 451.
  Verify after deploying: a Vercel function log line for `/api/collect` should show the `fra1`
  region, and `/api/health` should return measurably faster.
- **`https://data-api.binance.vision/api/v3/klines`** (Binance spot market data, no futures
  geo-restriction) as a secondary behind the futures primary. Same response shape, so
  `isRawKline` and the OHLCV mapping are reused as-is. Pairs are the same strings
  (`BTCUSDT`…). Marked in `SourceStatus` as `klines:1d:spot-fallback`.

**Hard constraint:** the spot fallback is for the live hourly snapshot only. `fetchKlinesRange`
(backfill, spec 013) stays futures-only — `BACKFILL_START` dates and spec 012's distance metric
assume one continuous futures series. Mixing them corrupts history that cannot be
re-derived.

CoinGecko is a third option and a poor one here: its OHLC endpoint has coarse granularity, a
tight free-tier rate limit, and a different candle shape. Use it only if both above fail.

---

## 5.1 The scheduler is slower than the freshness window

Slice 0 measured the real `collect.yml` cadence at **~4.4 hours**, against a configured hourly
cron. That is normal GitHub Actions behaviour, not a misconfiguration: scheduled workflows on
the free tier are queued behind load, routinely delayed by tens of minutes to hours, and
silently dropped entirely at peak times. GitHub documents no delivery guarantee for `schedule`.

This matters after the kline fix, not before it. `SIGNALS_FRESHNESS_HOURS = 3` means a
4.4-hour average gap leaves the Signals feed empty for a large share of every day even when
collection is working perfectly — the page would go back to looking broken for a completely
different reason, and the next person to debug it would start from scratch.

Three honest responses, to be chosen and recorded in Slice 6 rather than defaulted into:

1. Accept it and widen `SIGNALS_FRESHNESS_HOURS` to cover the real cadence — but then say so on
   the page; a 5-hour-old signal presented as current is the `decisions.md` §3 failure again.
2. Move the primary schedule to Vercel Cron and keep Actions as the fallback, inverting today's
   arrangement. Hobby allows one cron a day, so this costs a plan upgrade — a real decision,
   not a free one.
3. Leave the cadence and change what "empty" means: distinguish "no signal crossed a threshold"
   from "no snapshot recent enough to evaluate" in the API, not only in the copy.

Do not widen the window silently. The feed being empty is a data problem; hiding it behind a
larger constant is how the original 14-day outage stayed invisible.

## 6. News feeds

`newsFeed.ts` proxies every feed through `https://api.rss2json.com/v1/api.json`. All three
return 422 — the bridge, not the feeds. Fetch the feeds' own XML and parse it.

Two things change with direct XML:

- **Date format.** `parsePubDate` currently expects rss2json's normalised
  `"2026-09-01 13:45:00"` (UTC). Raw RSS emits RFC-822
  (`Mon, 01 Sep 2026 13:45:00 +0000`), and Atom emits ISO-8601. Parse both; an unparsable date
  **rejects the item**. Never substitute `now()` — `publishNews` computes ageing and expiry
  from `published_at`, so a wrong date puts a stale headline inside the impact horizon.
- **Item shape.** RSS `<item>` vs Atom `<entry>`, `<link>` as text vs `href` attribute. Handle
  both or verify all three feeds are RSS 2.0 and say so in a comment.

Use `fast-xml-parser` (small, no native deps) or a narrow hand-rolled extractor. Keep per-feed
isolation: one feed's failure contributes nothing and does not affect the others. Ingest stays
idempotent on `url_hash`.

---

## 7. The self-contradicting empty state

`SignalsPage.tsx` computes `showStaleCollection` and renders `StaleCollectionNotice` above the
feed, then renders an empty state whose body is the hard-coded string "Collection is healthy
and up to date — no tracked market condition has crossed a threshold worth flagging."

The empty state must branch on the same `showStaleCollection` value already in scope. Stale
variant: no health claim, state the age, say signals cannot be current. Same for
`NewsFeedSection`'s "No live news signals".

This is a one-line-each change with a disproportionate payoff: it is the only thing on the page
that tells the operator whether "empty" means quiet or broken.

---

## 8. Verification, and what not to accept

A 200 from one manual `/api/collect` run is not the exit criterion — the run that produced this
spec's evidence also wrote collector rows while failing. Accept only:

- three snapshot rows for the current hour, with real prices;
- `/api/health` → `ok: true`, `stale: false`, age under `SNAPSHOT_STALE_MINUTES`;
- 24 distinct snapshot hours per asset over a following 24-hour window (this is 017 Slice 1's
  query, already in `docs/runbook.md` — reuse it, do not rewrite it);
- news items with `published_at` values that match the articles.

Then add the defect and its resolution to `context/product/decisions.md` §8. The standing rule
in `EXECUTION-PLAN.md` requires it, and this defect's real cost was the fourteen days nobody
could see it.
