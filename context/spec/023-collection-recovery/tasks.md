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
- [x] Deploy. Run `/api/collect` manually (Vercel → Settings → Cron Jobs → Run, or POST with
      `Authorization: Bearer $CRON_SECRET`). **PENDING — operator** (no deploy access from
      this environment).
- [ ] ~~Record the exact status for each of the 12 (asset × timeframe) fetches~~ — **superseded**.
      The `fra1` region shipped in the same deploy, so by the first run on the new build every
      fetch succeeded and there was no failure status left to capture. The cause was identified
      from the Vercel routing log instead (`iad1` → 502, `fra1` → 200). Slice 1's instrumentation
      stands for the next failure, unexercised by this one.
- [ ] ~~Record in `docs/runbook.md`: the exact status for each of the 12 (asset × timeframe)
      fetches. State whether all timeframes failed or only some.~~ **PENDING — operator**, blocked
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

## Slice 3 — Fix the cause Slice 1 found — **DONE 2026-09-18, cause was the geo block**

Resolved before Slice 1's per-timeframe statuses were ever read: the region change fixed it on
its own. Evidence, from production:

- Failing run 09:26 UTC — Vercel log says `Routed to Washington, D.C., USA (iad1)`, 502.
- After `"regions": ["fra1"]` — run at 11:55 UTC returns
  `{"ok":true,"written":3}`, `X-Vercel-Id: fra1::fra1`, every asset's `klines` `ok: true`.
- **`price:fallback` never fired**, so the price came from `1d` — the klines fetch itself
  started working. Slice 2 was not what rescued it.
- Duration fell from 3.6 s to 2.29 s: `fra1` also removed the transatlantic hop to Neon
  (`aws-eu-central-1`).

`fapi.binance.com` refuses US-hosted requests. That is the whole bug, and it is why it never
reproduced from Poland.

- [x] **451 / geo block:** `"regions": ["fra1"]` in `vercel.json`. The pre-Slice-0 caution about
      trading a broken pipeline for a slow one did not apply — Neon is in Frankfurt, so this is
      a win on both axes.
- [ ] ~~429 / 418 backoff~~ — not the cause. Still worth doing on its own merits eventually,
      but not part of this spec.
- [ ] **Either way — a secondary source:** `https://data-api.binance.vision/api/v3/klines`
      (spot) behind the futures primary, same response shape, reusing `isRawKline`. Reported as
      a distinct `SourceStatus`, never silent.
- [ ] **Constraint, enforced in code and comment:** the spot fallback is live-snapshot only.
      `fetchKlinesRange` (backfill, spec 013) stays futures-only — mixing series corrupts spec
      012's distance metric and `BACKFILL_START`.

The remaining item is a **decision, not a diagnosis**: one Vercel region is now a single point
of failure for the whole pipeline. A spot secondary costs little and removes that. Recommended,
not required.

**Done when:** ~~a manual `/api/collect` writes three snapshot rows~~ — met 2026-09-18 11:55
UTC. Only the secondary-source decision is open.

---

## Slice 4 — Empty states stop contradicting the banner

- [x] `SignalsPage.tsx`: the market-state empty state branches on `showStaleCollection`
      (already in scope). Stale variant drops the "Collection is healthy and up to date" claim,
      states the age, and says signals cannot be current. (`marketEmptyStateCopy` in
      `src/lib/freshness.ts`.)
- [x] Same for `NewsFeedSection`'s "No live news signals". (`newsEmptyStateCopy` in
      `src/lib/news/feed.ts`.)
- [x] Test both branches: fresh + empty → the quiet-market copy; stale + empty → the stale
      copy, and the words "healthy" and "up to date" appear nowhere on the page.
      (`src/scripts/empty-state-copy.test.ts` — pure functions, no DOM needed since the copy
      itself was extracted out of the component.)

**Done when:** the page cannot claim health while its own banner says collection may be
stalled.

---

## Slice 5 — News without rss2json

- [x] Replace the rss2json bridge with direct fetches of the three feeds' own RSS/Atom
      endpoints. `RSS_FEEDS` already held each feed's own URL (rss2json only wrapped it in a
      query param), so `fetchFeed` now fetches it directly with a UA header and parses the XML
      itself — no new dependency, a narrow hand-rolled extractor per technical-considerations §6.
- [x] `parsePubDate` handles RFC-822 and ISO-8601 (delegates to `Date`'s native parser, which
      accepts both natively; verified against fixtures of each in
      `src/scripts/news-feed-xml.test.ts`). An unparsable date **rejects the item** — returns
      `null`, never `now()` — and `toIngestedItem` drops the item on `null`.
- [x] Handles both RSS `<item>` (`<link>` as text) and Atom `<entry>` (`<link href="...">`,
      preferring `rel="alternate"`) — `parseFeedXml`/`extractLink`. Not narrowed to "RSS 2.0
      only" since handling both cost no extra complexity and covers a future feed addition.
- [x] Kept per-feed isolation (`Promise.allSettled`, unchanged), honest `SourceStatus` per feed
      (a feed whose body parses to zero `<item>`/`<entry>` blocks is now a reported failure, not
      a silent empty success), and idempotent ingest on `url_hash` (`normalizeUrl`/`hashUrl`
      unchanged).
- [x] Test: `src/scripts/news-feed-xml.test.ts` — RSS `<item>` parsing, Atom `<entry>` parsing
      (link preference, CDATA + entity decoding), and malformed/truncated/non-feed XML yielding
      zero items (which `fetchFeed` turns into one failed `SourceStatus`, isolated by
      `Promise.allSettled` the same as a network failure — the "doesn't affect the other two"
      guarantee was already covered by the existing per-feed isolation, unchanged here).
      `src/scripts/news.test.ts` updated to RFC-822 fixtures (the old rss2json-normalised date
      format no longer exists) and a new case for an unparsable date rejecting the item.

**Done when:** news items appear with `published_at` values matching the articles, and
`news:*` sources report per feed.

---

## Slice 6 — Prove it, then write it down

- [ ] Re-run 017 Slice 1's 24-hour completeness query from `docs/runbook.md` (do not rewrite
      it): 24 distinct snapshot hours per asset, no gaps.
- [ ] Investigate and record the cause of **every** missing hour. Do not average them away.
- [x] ~~Confirm the hourly Actions path is green~~ — replaced by the external hourly cron
      (see the cadence entry above). Actions is now a fallback, not the primary; a red run
      there no longer means collection stopped.
- [ ] ~~Confirm the hourly Actions path is green — the `vercel.json` cron is daily, and with a
      3-hour `SIGNALS_FRESHNESS_HOURS` a daily-only run leaves the feed empty 21 hours in 24.~~
- [x] Scheduler cadence (technical-considerations §5.1) — **decided 2026-09-18**: none of the
      three listed options was taken. Instead the cadence itself was fixed, which was the
      cleaner answer. An external free cron (cron-job.org) now POSTs `/api/collect` at `7 * * * *`
      with `Authorization: Bearer <CRON_SECRET>`, verified 200 / `written: 3`. Hourly collection
      against a 3 h freshness window leaves no routine gap, so `SIGNALS_FRESHNESS_HOURS` stays
      at 3 — deliberately not widened.
      GitHub Actions `collect.yml` and the daily `vercel.json` cron remain as redundant
      fallbacks; the endpoint is idempotent per hour, so three triggers are harmless.
      Failure email notifications are enabled on the external cron — the first automated alarm
      this pipeline has ever had, and the absence of one is why the outage ran 16 days.
- [ ] Verify the hourly cron actually fires unattended: `snapshots24h` should climb by one per
      hour. One successful test run is not evidence of a working schedule.
- [ ] Re-sync `CRON_SECRET` in `.env.local` (confirmed stale on 2026-09-18 — a direct POST with
      it returned 401) and confirm the GitHub Actions secret still matches production.
- [ ] Signals page shows either real signals or the correct stale-free empty state.
- [ ] Add to `decisions.md` §8 the reporting defect found on the way: `<SYMBOL>:snapshotBuilder`
      rows are written to `collector_status` **only from the catch block**, so a source that
      succeeds never updates and stays permanently red with a stale `lastError`
      (`lastSuccessAt: null` even now that collection works). A source that cannot report
      success is worse than no row at all in a health endpoint.
- [ ] Also record the ETF flows gap: `BTC:etfFlows` / `ETH:etfFlows` return
      `collector returned null` on every run (Farside). Field stays null; separate from 023.
- [ ] Add the defect and its resolution to `context/product/decisions.md` §8.
- [ ] Decide separately, and record: backfill the ~14 lost days, or accept the gap. Do not
      bundle that decision into this spec.

**Done when:** collection has run unattended for 24 hours with health green, and `context/`
describes what the code now actually does.
