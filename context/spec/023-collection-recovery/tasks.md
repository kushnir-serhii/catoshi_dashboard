# Tasks: Collection Recovery

Slice 1 is a **gate**: it produces a number, not a fix. Slices 3 onward depend on that number.
Slice 2 is independent of it and can land first — it is the defence that stops one dead
timeframe from costing a whole hour again.

Every slice is done when its behaviour exists and is verified, not when it compiles.

---

## Slice 0 — Cheap checks before touching code

- [x] Vercel → Environment Variables: confirm `CRON_SECRET`, `COLLECT_ENDPOINT`,
      `FORECAST_INGEST_SECRET`, `ADMIN_SECRET` carry **no surrounding quotes**. Same bug class
      as `DATABASE_URL` (2026-09-16). A quoted `CRON_SECRET` 401s every hourly run.
- [x] GitHub Actions → `collect.yml` run history: are hourly runs firing, and what status?
      Record the last 24 runs. Note: GitHub disables scheduled workflows after 60 days without
      repo activity.
- [x] Record where the Neon project is hosted (region). Slice 3 needs it.

**Done when:** these three facts are written in `docs/runbook.md`, whatever they say.

---

## Slice 1 — Make the kline failure legible (GATE)

- [x] `fetchKlines` returns the failure reason, not a bare `null`. Carry HTTP status, or
      `network` / `malformed`. Keep the success shape (`OHLCV[]`) unchanged for callers.
- [x] Log one line per failed fetch: pair, interval, status, and the first ~200 chars of the
      response body. Binance puts its refusal reason in the body.
- [x] `buildSnapshot`: the `klines` `SourceStatus` is `ok: false` when every
      `COLLECT_TIMEFRAMES` entry is null, carrying the per-timeframe reasons. Today `settle`
      reports `ok: true` because `fetchAllTimeframes` resolved — see technical-considerations §3.
- [x] Stop losing statuses on a throw: when `assembleSnapshot` throws inside `buildSnapshot`,
      the collected `sources` array is discarded and the route's catch seeds from `undefined` —
      confirmed on prod 2026-09-18, `/api/health` shows no `klines:*` row at all. Attach the
      sources to the error (or return a failure result) and merge them in the catch. Without
      this, everything added above is thrown away exactly when it matters.
- [ ] Deploy. Run `/api/collect` manually (Vercel → Settings → Cron Jobs → Run, or POST with
      `Authorization: Bearer $CRON_SECRET`). **PENDING — operator** (no deploy access from
      this environment).
- [ ] Record in `docs/runbook.md`: the exact status for each of the 12 (asset × timeframe)
      fetches. State whether all timeframes failed or only some. **PENDING — operator**, blocked
      on the deploy above.

**Done when:** you can name the reason `1d` is missing, with a status code. **Do not start
Slice 3 before this.**

---

## Slice 2 — A snapshot survives a missing timeframe

- [x] `assembleSnapshot`: derive `latestPrice` in order `1d → 4h → 1h → 15m`, from the
      **sliced** series (never the raw input — `sliceAt` must keep applying, or the backfill
      regains look-ahead). (Uses the already-sliced `closesDaily`/`closes4h`/`closes1h`/
      `closes15m` arrays — `sliceAt` is applied before the fallback ever runs.)
- [x] Throw only when every timeframe is empty. Keep the existing message shape for that case.
- [x] Record the origin: `raw.priceSource` = the timeframe used, plus a
      `SourceStatus { source: 'price:fallback', note: '<tf>' }` when it is not `1d`.
- [x] Verify daily-only fields stay `null` without daily candles: `ma7Daily`, `ma25Daily`,
      `ma99Daily`, `pctFromMa*Daily`, `atrDaily`, `volumeZDaily`, `structureDaily`,
      `volume24hUsd`. No substitute timeframe feeds a column named `*Daily`.
- [x] Test: `1d: null` + populated `4h` → snapshot written, `priceSource: '4h'`, daily
      indicators null. (`src/scripts/snapshot-builder.test.ts`)
- [x] Test: all timeframes null → still throws. (Also covered: all-empty-array form.)
- [x] Test: the guard fails when removed. (Verified manually by temporarily reverting the
      `latestPrice === null` guard to the pre-Slice-2 daily-only check and confirming the
      "1d null + populated 4h" test then fails instead of passing vacuously; reverted after
      confirming.)

**Done when:** a dead `1d` feed costs the daily indicators for that hour and nothing else.

---

## Slice 3 — Fix the cause Slice 1 found

Do exactly one of these, chosen by the recorded status.

- [ ] **451 / geo block:** set the function region in `vercel.json`. Weigh it against the Neon
      region from Slice 0 — functions in `fra1` against a US database adds a round trip to
      every query. If that trade is bad, use the spot fallback below instead. Record which and
      why.
- [ ] **429 / 418:** give `fetchKlines` the retry + `Retry-After` backoff that
      `fetchKlinesPage` already has. Stagger the four timeframe requests instead of firing them
      as one `Promise.all` burst alongside funding / OI / long-short.
- [ ] **Either way — a secondary source:** `https://data-api.binance.vision/api/v3/klines`
      (spot) behind the futures primary, same response shape, reusing `isRawKline`. Reported as
      a distinct `SourceStatus`, never silent.
- [ ] **Constraint, enforced in code and comment:** the spot fallback is live-snapshot only.
      `fetchKlinesRange` (backfill, spec 013) stays futures-only — mixing series corrupts spec
      012's distance metric and `BACKFILL_START`.

**Done when:** a manual `/api/collect` writes three snapshot rows for the current hour with
real prices, and `/api/health` returns `ok: true`.

---

## Slice 4 — Empty states stop contradicting the banner

- [ ] `SignalsPage.tsx`: the market-state empty state branches on `showStaleCollection`
      (already in scope). Stale variant drops the "Collection is healthy and up to date" claim,
      states the age, and says signals cannot be current.
- [ ] Same for `NewsFeedSection`'s "No live news signals".
- [ ] Test both branches: fresh + empty → the quiet-market copy; stale + empty → the stale
      copy, and the words "healthy" and "up to date" appear nowhere on the page.

**Done when:** the page cannot claim health while its own banner says collection may be
stalled.

---

## Slice 5 — News without rss2json

- [ ] Replace the rss2json bridge with direct fetches of the three feeds' own RSS/Atom
      endpoints.
- [ ] `parsePubDate` handles RFC-822 and ISO-8601. An unparsable date **rejects the item** —
      never `now()`. `publishNews` computes ageing and expiry from `published_at`, so a wrong
      date puts a stale headline inside the impact horizon.
- [ ] Handle RSS `<item>` and Atom `<entry>` (`<link>` text vs `href`), or verify all three
      feeds are RSS 2.0 and record that in a comment.
- [ ] Keep per-feed isolation, honest `SourceStatus` per feed, and idempotent ingest on
      `url_hash`.
- [ ] Test: a feed returning malformed XML contributes nothing and does not affect the other
      two.

**Done when:** news items appear with `published_at` values matching the articles, and
`news:*` sources report per feed.

---

## Slice 6 — Prove it, then write it down

- [ ] Re-run 017 Slice 1's 24-hour completeness query from `docs/runbook.md` (do not rewrite
      it): 24 distinct snapshot hours per asset, no gaps.
- [ ] Investigate and record the cause of **every** missing hour. Do not average them away.
- [ ] Confirm the hourly Actions path is green — the `vercel.json` cron is daily, and with a
      3-hour `SIGNALS_FRESHNESS_HOURS` a daily-only run leaves the feed empty 21 hours in 24.
- [ ] Decide and record the scheduler cadence question (technical-considerations §5.1): the
      measured `collect.yml` cadence is ~4.4 h against a 3 h `SIGNALS_FRESHNESS_HOURS`, so the
      feed stays empty much of the day even when collection works. Pick one of the three
      options there. Do not widen the constant silently.
- [ ] Signals page shows either real signals or the correct stale-free empty state.
- [ ] Add the defect and its resolution to `context/product/decisions.md` §8.
- [ ] Decide separately, and record: backfill the ~14 lost days, or accept the gap. Do not
      bundle that decision into this spec.

**Done when:** collection has run unattended for 24 hours with health green, and `context/`
describes what the code now actually does.
