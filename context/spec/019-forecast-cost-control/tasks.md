# Tasks: Forecast Cost Control and Route Consolidation

Order matters. Slice 1 is a pure refactor with no behaviour change and it is what makes
Slices 2–3 small. Do not start Slice 3 before Slice 1: gating a route that exists twice gates
one of them.

Agent tag: `[Agent: nextjs-fullstack]`. Operator steps are marked `[Operator]`.

---

## Slice 1 — One forecast path

- [x] Create `src/lib/forecast/params.ts` with the exported `validateForecastParams(service,
      model)` — the logic currently duplicated as a private `validateParams` in
      `src/lib/forecastProvider.ts` and `src/app/api/projections/refresh/route.ts`. Both keep
      working by importing it. **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/forecast/mock.ts` and move `seededRng`, `buildScenario`, `COIN_CONFIGS`,
      `buildProjection`, `hashString`, `buildMockProjectionForCoin` into it. Delete both
      copies from the routes. `grep -c COIN_CONFIGS src -r` must report one file. **[Agent: nextjs-fullstack]**
- [x] Create `src/lib/forecast/run.ts` with `runForecast(options)` per
      technical-considerations §2.1, including the snapshot age-limit block and its comment
      moved verbatim from `src/app/api/projections/route.ts`. **[Agent: nextjs-fullstack]**
- [x] Rewrite both routes as callers of `runForecast`. `GET` passes `awaitPersist: false`,
      refresh passes `true`. **[Agent: nextjs-fullstack]**
- [x] Move `FORECAST_TTL_SECONDS` (21600) and `FORECAST_DAILY_CALL_LIMIT` (20) into
      `src/consts/projections.ts`. No inline `21600` anywhere. **[Agent: nextjs-fullstack]**
- [x] `GET` validates before deriving the cache key; the key uses the validated pair; the
      response reports the pair that actually ran. **[Agent: nextjs-fullstack]**
- [x] `src/scripts/forecast-params.test.ts` per technical-considerations §4, including the
      fifty-junk-values case. **[Agent: nextjs-fullstack]**

**Done when:** `npm run lint` and `npx tsc --noEmit` are clean, the params test passes, and
fifty requests with distinct invalid `?model=` values add at most one row group to
`public.forecasts`.

---

## Slice 2 — `public.forecasts` as the cache of record

- [x] Add `getLatestForecasts(symbols, maxAgeMs)` to `src/lib/db/analytics.ts` per
      technical-considerations §2.2, with the `schema_version` equality in the SQL, not in
      TypeScript. **[Agent: nextjs-fullstack]**
- [x] `GET` lookup order: platform cache → `getLatestForecasts` → `runForecast`. A stored hit
      returns without a model call. **[Agent: nextjs-fullstack]**
- [x] Partial coverage of the target batch is a miss for the whole batch. Comment why
      (mixing a fresh curve with a stale one is `decisions.md` §3). **[Agent: nextjs-fullstack]**
- [x] A database read failure is **not** fatal: log it and fall through to generation. The
      user gets a forecast; the log says the store was unreachable. **[Agent: nextjs-fullstack]**
- [x] `src/scripts/forecast-store.test.ts` — mapping round trip, schema-version miss, missing
      scenario miss, two-of-three batch miss. **[Agent: nextjs-fullstack]**

**Done when:** with a fresh row in `forecasts`, a cold start (or `revalidateTag` from a
redeploy) serves projections with zero model calls, proven by the day's generation count not
moving.

---

## Slice 3 — Reforecast: locked, capped, recorded

- [x] `ADMIN_SECRET` in `.env.example` with a comment saying what it unlocks and that an unset
      value means the route answers 503, never open. **[Agent: nextjs-fullstack]**
- [x] Credential check on `POST /api/projections/refresh`: `Authorization: Bearer` or the
      `catoshi_admin` cookie, `crypto.timingSafeEqual`, following the `CRON_SECRET` check in
      `src/app/api/collect/route.ts`. A 401 must happen **before** `fetchMarketData`. **[Agent: nextjs-fullstack]**
- [x] `GET /api/admin/unlock?key=…` sets the cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in
      production, 30 days); an empty `key` clears it. No page, no form — a URL the operator
      visits once. **[Agent: nextjs-fullstack]**
- [x] Daily ceiling per technical-considerations §2.5: 429 with `{ count, limit }` over the
      limit, 503 and refusal when the count cannot be read. The `GET` path never runs the
      count query. **[Agent: nextjs-fullstack]**
- [x] Reorder the route: generate → awaited persist → `revalidateTag('projections')` →
      respond. Assert by test or comment that a failed generation leaves the tag intact. **[Agent: nextjs-fullstack]**
- [x] `ForecastSettingsModal.tsx` and `ProjectionsPage.tsx`: render 401 as "operator unlock
      required", 429 as "daily limit reached (n/N)", 503 as "refresh disabled". No silent
      no-op, no success toast on a non-2xx. **[Agent: nextjs-fullstack]**
- [x] For a coin outside `DEFAULT_FORECAST_TARGETS`, the UI states the forecast is
      session-only and not stored (it has no `assets` row). **[Agent: nextjs-fullstack]**
- [x] `src/scripts/forecast-guard.test.ts` — ceiling counts generations not rows, unreadable
      count refuses, wrong secret rejected, length mismatch does not throw. **[Agent: nextjs-fullstack]**
- [ ] Set `ADMIN_SECRET` locally and in Vercel; visit the unlock URL once in each browser
      used for testing. **[Operator]**

**Done when:** `curl -X POST` with no header returns 401 and adds no generation; one
Reforecast click with the cookie adds exactly one; the next `GET` adds none.

---

## Slice 4 — Background classification off switch

- [x] `NEWS_CLASSIFY_ENABLED` in `.env.example`, default `true`, with a comment that it is the
      product's only background model call. **[Agent: nextjs-fullstack]**
- [x] Guard the `classifyNews()` call site in `src/app/api/collect/route.ts`; when disabled,
      append `{ source: 'news:classify', ok: true, disabled: true }` and call no model. Add
      `disabled?: boolean` to that source type. **[Agent: nextjs-fullstack]**
- [x] `/api/health` and `src/lib/freshness.ts` report the paused state as its own state, not
      as healthy and not as failed. **[Agent: nextjs-fullstack]**
- [x] The Signals page renders "news classification paused" where news cards would be, instead
      of an empty section (README §4 rule 1). **[Agent: nextjs-fullstack]**
- [x] Ingest and publish stay unguarded — no model, and publish only copies already-classified
      rows. Confirm by reading, and say so in the commit message. **[Agent: nextjs-fullstack]**
- [ ] Set `NEWS_CLASSIFY_ENABLED=false` in Vercel while testing alone. Leave
      `.github/workflows/collect.yml` and the Vercel cron **running** — snapshots are free and
      Binance keeps only ~30 days of derivatives history. **[Operator]**

**Done when:** a collection run with the flag off reports the paused source, `/api/health`
shows it, and the day's generation count is unchanged.

---

## Slice 5 — Prove the bill

- [x] Confirm no scheduled job requests projections: `grep -r projections .github/workflows
      vercel.json` returns nothing. **[Agent: nextjs-fullstack]**
- [x] Update `docs/runbook.md` with a short section: the three environment values introduced
      here, the unlock URL, the query that counts the day's generations, and what each honest
      UI state means. **[Agent: nextjs-fullstack]**
- [ ] Run one normal testing day. Record the generation count and compare it against windows
      opened plus Reforecast clicks. If they disagree, the difference is a defect — find it
      before closing the spec. **[Operator]**
- [x] Tick the roadmap item and set this spec's status line in `context/README.md` §3. **[Agent: nextjs-fullstack]**

**Done when:** the counted generations equal the intended ones for a full day, and the runbook
tells a future operator how to check it in one query.
