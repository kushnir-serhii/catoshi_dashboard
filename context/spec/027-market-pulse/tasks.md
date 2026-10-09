# Tasks: Market Pulse & Signals Coverage

Ordered so the feed gets more correct before anything summarises it. A summary of an
incomplete feed would just be a confident summary of the gaps. Slice 6 is a **gate**.

Each slice is done when its behaviour is verified, not when it compiles. Verify tasks are
smoke checks only (`npx eslint <touched files>` since repo-wide `npm run lint` fails on a
clean tree with 308 pre-existing CRLF/import-sort errors, `npx tsc --noEmit`, `npm test`,
plus one quick manual check if user-visible). **All new tests live in the final slice**
(max 3 files). Verify tasks delete any screenshots/scripts they produce and stop any server
they started, by PID.

Slice 1 was implemented before this file was regenerated; its checked items are kept as-is.

---

- [x] **Slice 1: News quality (spec 015 code)**

  > Cleaner news half of the feed: macro shocks as `market`, event/opinion split, merged duplicates, all three feeds visible in source status.
  - [x] Find why `cointelegraph` yields zero rows. Fix it, or mark it dead. Add per-feed rows to `collector_status`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Prompt: macro shocks → `market`, ≥ `MEDIUM`; `content_type` event/opinion; horizon caps. Bump `NEWS_PROMPT_VERSION`. **[Agent: ai-provider]** **[Model: sonnet]**
  - [x] Migration `0013`: `news_classifications.content_type`, `news_items.cluster_id`. **[Agent: nextjs-fullstack]** **[Model: opus]**
  - [x] Validation drops rows that break the horizon caps or miss `content_type` (technical §5.1). **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `src/lib/news/cluster.ts`: overlap coefficient ≥ 0.35, ≥ 2 shared entities, series-prefix strip (`decisions.md`), not Jaccard 0.5. **[Agent: nextjs-fullstack]** **[Model: opus]**
  - [x] Read path collapses clusters into one card with all sources; "Opinion" badge. Extend `src/components/signals/NewsCard.tsx`, `NewsSourceList.tsx` (new, exists). **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Re-classify the last 7 days under the new version (insert, never overwrite). **Blocked on the operator:** migration 0013 is applied; he runs or approves the re-classification separately (`decisions.md`). Slice 1 is not done until it has run and the functional §2.5 acceptance criteria are checked on the result. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Verify: after the re-classification, check §2.5 criteria on live data (tanker headline is `market` ≥ `MEDIUM`, duplicate pairs merged, the "in play" headline is `opinion`, three feeds in source status); `npx tsc --noEmit`, `npm test`. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

- [x] **Slice 2: Market-state coverage**

  > `/signals` shows every live market-state signal, with the new rules that would have fired on 2026-10-07.
  - [x] Add constants to `src/consts/signals.ts`: `SIGNALS_EXPANDED_COUNT` (rename of `SIGNALS_COUNT`), `SIGNALS_PREV_GAP_MIN_MINUTES` 45, `SIGNALS_PREV_GAP_MAX_MINUTES` 90, `RANGE_BREAK_BUFFER_PCT` 0.3, `ETF_STREAK_MIN_DAYS` 3, `ETF_SINGLE_DAY_USD` 100e6, `PULSE_OI_FLUSH_PCT` and `PULSE_PRICE_FLUSH_PCT` (or in `src/consts/pulse.ts` if Slice 4 lands first). **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Extend the rule signature in `src/lib/signals/types.ts` and `generate.ts` with `ctx.history4h`, loaded once per run per asset via `fetchKlines` 4h, closed candles only (technical §4.1). Existing rules ignore `ctx`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `src/lib/signals/rules/etf_streak.ts`: 3 days or ±$100M single day. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] New rules, one file each in `src/lib/signals/rules/`, registered in `index.ts`: `long_flush`, `short_squeeze`, `price_velocity`, `range_break`, `rsi_1h_extreme`. Null and gap discipline (gap tolerance 45–90 min; RSI ≤ 25 bullish, ≥ 75 bearish, LOW). Check the snapshot stores 1h RSI; if not, add it to the snapshot builder, not the rule. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `src/app/api/signals/route.ts` returns all live rows (no truncation). `SignalsPage.tsx` (extend) expands the top `SIGNALS_EXPANDED_COUNT` and collapses the rest under "Show N more"; reuse `SignalCard`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Verify: eslint on touched files, `npx tsc --noEmit`, `npm test`; load `/signals` and confirm the "Show N more" control works. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

- [ ] **Slice 3: Macro + calendar**

  > Brent / 10Y / dollar backdrop cards with observation dates, and a hand-maintained event calendar.
  - [ ] Reachability `workflow_dispatch`: FRED from the Actions runner and from Vercel `fra1`. Record the result here. **Stop the slice if unreachable.** Run this first, in parallel with Slices 1–2, because it can stop the slice. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
    > Result 2026-10-09: Actions runner → reachable (run 37916232825, success), keyed API without key HTTP 400 "api_key is not set" in 0.23s; keyless CSV fredgraph.csv DGS10 / DCOILBRENTEU / DTWEXBGS all HTTP 200 with data in 0.13-0.21s (a keyless fallback exists); Vercel fra1: pending operator deploy.
  - [x] `src/consts/macro.ts`: series ids, `MACRO_FETCH_INTERVAL_HOURS` 6, per-series `MACRO_MAX_AGE_DAYS` (`DGS10` 4, `DCOILBRENTEU` 10, `DTWEXBGS` 12), `MACRO_DECAY_HOURS` 72; add `FRED_API_KEY` to `.env.example`. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Migration `macro_readings` (next free number in `db/migrations/`); `src/lib/collectors/macro.ts`, 6h gate, `.` values skipped, `collector_status` row `macro`; wire into `/api/collect` as non-fatal. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Rules `macro_brent` (±3%), `macro_10y` (±8 bp), `macro_dollar` (±0.5%), scope `market`, rising = bearish. Null on a missing reading or beyond per-series max age; card text carries "as of <obs date>"; decay by observation age. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `src/data/macro-calendar.json` with an `updated` field, seeded with the next 30 days (public dates seen 2026-10-09, verify against Fed/BLS: CPI 10-14, PPI and retail sales 10-15, FOMC 10-27/28, PCE 10-29, US midterms 11-03). Health warning at 21 days since `updated`. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Verify: eslint on touched files, `npx tsc --noEmit`, `npm test`; run `/api/collect` locally, confirm `macro_readings` rows and a macro card (or a clean null) on `/signals`. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

- [x] **Slice 4: Pulse compute + history**

  > `GET /api/pulse` returns a stored, versioned Pulse per scope with all four statuses.
  - [x] `src/consts/pulse.ts` (technical §9), including `PULSE_SEVERITY` (LOW 0.35 / MEDIUM 0.65 / HIGH 1.0), `PULSE_RULE_CATEGORY`, and the `PULSE_CATEGORY_COLLECTOR` map used for `missing` (partial news feeds included). **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Add `PulseResponse`, driver and scope types to `src/data/types.ts`. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] `src/lib/pulse/compute.ts` + `summary.ts`, both pure (technical §2.2–2.4: category cap before weight, cluster counted once, null `content_type` excluded). **[Agent: nextjs-fullstack]** **[Model: opus]**
  - [x] Migration `market_pulse` (+ db helpers in `src/lib/db/pulse.ts`); compute per scope inside `/api/collect` after news publish and macro rules; non-fatal. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `src/app/api/pulse/route.ts`: `GET ?scope=`, `force-dynamic`, guarded by `NEXT_PUBLIC_USE_MOCK_DATA`; all four statuses; `stale`/`insufficient`/`unavailable` carry no numbers; `prev24h` within ±2h else null; unknown scope → 400; `nextEvent` from the calendar within 72h. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] `/api/health` gains a `pulse` entry. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Verify: eslint on touched files, `npx tsc --noEmit`, `npm test`; run a local collect, then `curl /api/pulse?scope=market` and `?scope=bogus` (expect 400). No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

- [x] **Slice 5: Market Pulse UI**

  > The Pulse block at the top of Signals, in every state, at 1440px and 375px.
  - [x] `src/hooks/useMarketPulse.ts` (new; SWR, 60s, same interval as `useSignals`). **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Tokens `--pulse-bear/range/bull` in the theme token file. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] new: `src/components/signals/PulseBar.tsx` (bar, zone label, ghost 24h marker, Conflict stripes + ⚖️ badge, `role="meter"` with `aria-valuemin/max/now/text`); new: `PulseScopeSwitch.tsx` (map over scopes); new: `PulseDriverChips.tsx` (map over drivers). Add each to `src/components/signals/index.ts`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] new: `src/components/signals/MarketPulse.tsx` composing the three above plus summary line, next-event line, freshness line (viewer's local time zone) and disclaimer. Every failure state from functional §2.2, including "Without: <category>". Type scale ≥ 12px. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] extend: `SignalsPage.tsx` renders `MarketPulse` at the top; driver chip click expands collapsed cards, `scrollIntoView`, 2s highlight ring on the card with the matching `id`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Update `context/components-index.md` for the new components. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Verify: eslint on touched files, `npx tsc --noEmit`, `npm test`; start the dev server, check `/signals` at 1440px and 375px (no horizontal scroll), chip click, scope switch, stale/unavailable states; delete screenshots and stop the server by PID. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

- [x] **Slice 6: GATE: backtest**

  > A recorded A / B / C verdict decides whether Slice 7 ships.
  - [x] Pure `decideNotifications(pulseSeries, sent)` in `src/lib/pulse/notify-decision.ts` (alert types, 24h dedupe, `PULSE_ALERT_MIN_CATEGORIES`, `PULSE_ALERT_BEAR_MIN`, `PULSE_REVERSAL_POINTS`). **[Agent: nextjs-fullstack]** **[Model: opus]**
  - [x] `src/scripts/pulse-backtest.ts` + `workflow_dispatch` workflow: rebuild the signal set per live-collected hour with no look-ahead; same-direction base rate, one-sided binomial p-value, alerts ≥ 72h apart, `market` priced on BTC (technical §8.1); upload the report as an artifact. **[Agent: nextjs-fullstack]** **[Model: opus]**
  - [x] Run it and record the verdict **A / B / C** with numbers in functional §2.8. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Verify: eslint on touched files, `npx tsc --noEmit`, `npm test`; the report artifact opens and the §2.8 numbers match it. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**

  | Verdict | Next |
  |---|---|
  | A | Slice 7, `PULSE_NOTIFY_VERDICT=A` |
  | B | Slice 7, `PULSE_NOTIFY_VERDICT=B` (labelled "Unvalidated"); re-run monthly |
  | C | **Skip Slice 7.** Keep the UI. Open a follow-on to revisit weights |

- [ ] **Slice 7: Telegram (operator only; skip on Verdict C)**

  > The operator gets confluence, conflict and reversal messages; nobody else.
  - [x] **Before anything is sent:** record the reversal in `product-definition.md` §3.2 (bounded operator-only exception, functional §2.7) and in the repo-level `decisions.md` (reasons: functional §0). Telegram must not ship while the product definition still says "no alerts". **[Agent: general-purpose]** **[Model: haiku]**
  - [x] Migration `pulse_notifications`; `src/lib/pulse/notify.ts` runs after compute using `decideNotifications`, 24h dedupe, HTML `sendMessage`, failures to `collector_status` under `telegram`, non-fatal; Verdict B messages prefixed "Unvalidated (backtest n = <n>)" and stored `validated = false`. **[Agent: nextjs-fullstack]** **[Model: sonnet]**
  - [x] Env `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APP_BASE_URL`, `PULSE_NOTIFY_VERDICT` in `.env.example`; missing = `disabled`. **[Agent: nextjs-fullstack]** **[Model: haiku]**
  - [x] Verify: one real test message to the operator chat; confirm the format and the `/signals` link; `npx tsc --noEmit`, `npm test`. No new tests. **[Agent: general-purpose]** **[Model: sonnet]**
    > Result 2026-10-09: real Telegram test message delivered, format OK, "Open Signals" link opens `/signals`. `npx tsc --noEmit` clean; `npm test` 245/245 pass. Env set in Vercel Production (`FRED_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APP_BASE_URL`); `PULSE_NOTIFY_VERDICT` intentionally unset.

- [x] **Slice 8: Record**

  > Docs reflect the shipped feature. (`product-definition.md` §3.2 moved to Slice 7.)
  - [x] `roadmap.md` Phase 4: add Market Pulse. **[Agent: general-purpose]** **[Model: haiku]**
  - [x] `README.md` §3: status line for 027. **[Agent: general-purpose]** **[Model: haiku]**
  - [x] `context/product/codebase-notes.md`: the pulse layer, the macro collector, the cluster step. **[Agent: general-purpose]** **[Model: haiku]**

- [x] **Slice 9: Feature Testing & Regression**

  > Verifies the whole feature end-to-end against functional-spec.md, run after all implementation slices are complete.
  - [x] Read functional-spec.md acceptance criteria in full. Write acceptance-level tests grouped into at most three files so each covers several criteria and slices: `src/scripts/signals-coverage.test.ts` (§2.3 and §2.4: new rules, `etf_streak`, 2h `previous` gap, null inputs, macro weekly-batch lag and max-age, the 2026-10-07 07:00Z replay where `etf_streak` and `long_flush`/`price_velocity` fire for ETH), `src/scripts/pulse.test.ts` (§2.1, §2.2, §2.7, technical §2.5: `insufficient` never zero, monotonicity, category cap, cluster counted once, Conflict boundary, opinion weight 0, null `content_type` excluded, MEDIUM-vs-MEDIUM no Conflict, the 10-07 golden case, `decideNotifications` dedupe), `src/scripts/pulse-api.test.ts` (API statuses, 400 on unknown scope, `prev24h` tolerance, backtest no-look-ahead). Slice 1's existing tests (`news-cluster`, `news-collapse`, `news-classify`) already cover §2.5. Annotate each test with `@spec: 027-market-pulse` and `@regression` where suitable. **[Agent: general-purpose]** **[Model: sonnet]**
  - [x] Run all generated tests plus the full existing suite. All must pass. Fix any failures before proceeding. **[Agent: general-purpose]** **[Model: sonnet]**

---

## Deliberately not in any slice

- Liquidation data or any always-on process.
- Exchange on-chain flow collection.
- LLM-written summary.
- Calibrating weights or thresholds. That needs spec 011 follow-on scoring.
