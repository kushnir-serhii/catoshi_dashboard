# Tasks: Scheduled Forecast Ingestion with On-Demand Fallback

Order matters. Slice 1 is a **gate**: if a scheduled task cannot reach the deployment, the
rest of this spec is unbuildable as written and must be reported, not worked around. Slice 2
is the write path, Slice 3 the guards that make the write path safe to expose, Slice 4 the
honesty of the surfaces, Slice 5 the schedule itself.

Agent tag: `[Agent: nextjs-fullstack]`. Operator steps are marked `[Operator]`.

---

## Slice 1 — Inputs endpoint ═══ GATE ═══

- [x] Extract the prompt-input assembly into `src/lib/forecast/inputs.ts`:
      `buildForecastInputs(targets)` returning market data, per-coin price context, per-coin
      reference price, `FORECAST_GRID_DAYS`, the output schema and `promptVersion`.
      `claude.ts` and `openai.ts` build their prompts from it — no second assembly.
      **[Agent: nextjs-fullstack]**
- [x] Add `FORECAST_INGEST_SECRET` to `.env.example` and a shared
      `checkIngestAuth(request)` (three-way `ok | unauthorized | unconfigured`, reusing
      `matchesAdminSecret`). **[Agent: nextjs-fullstack]**
- [x] `GET /api/projections/inputs` — auth-gated, `unstable_cache`d on the projections tag
      family, no model call, returns the payload above. **[Agent: nextjs-fullstack]**
- [ ] `[Operator]` Set `FORECAST_INGEST_SECRET` in Vercel and deploy.
- [ ] `[Operator]` **Gate:** create a throwaway scheduled Claude task that does nothing but
      `GET /api/projections/inputs` with the secret and report the HTTP status and the coin
      list it received.

**Gate outcomes**

| Result | Action |
|---|---|
| 200 with a usable payload | Continue to Slice 2 |
| Blocked / unreachable from the scheduled session | **Stop.** Record it in `product/decisions.md`, leave spec 019's paid on-demand path as the only producer, and close this spec as rejected in `README.md` §3 |

**Done when:** the gate outcome is recorded, and if it passed, `npm run lint` and
`npx tsc --noEmit` are clean with both providers building their prompts from `inputs.ts`.

---

## Slice 2 — Ingest write path

- [x] Fold the duplicated `snapScenarioToGrid` / `normalizeProbabilities` copies out of
      `claude.ts` into `gridSnap.ts`; `grep -rc "function snapScenarioToGrid" src` reports one
      file. **[Agent: nextjs-fullstack]**
- [x] `src/lib/forecast/ingest.ts` — pure `validateIngestBatch(payload, references)` returning
      accepted projections and per-coin rejections. No I/O. **[Agent: nextjs-fullstack]**
- [x] Widen `persistForecasts` to take an explicit `{ source, model, promptVersion, costUsd,
      usage }` instead of reading them off the projection, so a routine row stores
      `source='routine'`, `cost_usd=0`, null token counts. Existing callers pass what they
      pass today. **[Agent: nextjs-fullstack]**
- [x] `POST /api/projections/ingest` — auth → daily ingest ceiling → validate → persist
      (awaited) → `revalidateTag('projections', { expire: 0 })` **after** the write →
      per-coin stored/skipped/rejected in the response. **[Agent: nextjs-fullstack]**
- [x] New constants in `src/consts/projections.ts`: `ROUTINE_SOURCE`, `ROUTINE_PROMPT_VERSION`,
      `FORECAST_DAILY_INGEST_LIMIT`, `INGEST_ANCHOR_MAX_DEVIATION_PCT`,
      `SCHEDULED_FORECAST_INTERVAL_HOURS`, `SCHEDULED_FORECAST_LATE_AFTER_SECONDS`. No inline
      literals. **[Agent: nextjs-fullstack]**
- [x] Extend `ProjectionData.service` with `'routine'` and fix the compile sweep.
      **[Agent: nextjs-fullstack]**

**Done when:** a hand-crafted valid batch POSTs to 200, three `routine` rows with
`cost_usd = 0` appear in `public.forecasts`, and the next `GET /api/projections` serves them
with no model call.

---

## Slice 3 — Guards

- [x] Reference price per coin: latest snapshot within `FORECAST_SNAPSHOT_MAX_AGE_MINUTES`,
      else the live price; **refuse the ingest** when neither exists. **[Agent: nextjs-fullstack]**
- [x] Anchor deviation, grid coverage, probability normalisation, positive prices, strictly
      increasing `d`, unknown-coin skip — each rejecting with **422** and the failed check's
      name. **[Agent: nextjs-fullstack]**
- [x] A rejected ingest leaves the stored batch and the cache untouched (test).
      **[Agent: nextjs-fullstack]**
- [x] `getDailyForecastGenerationCount` counts paid rows only (`source <> 'routine'`), so
      ingests do not consume the operator's Reforecast ceiling. **[Agent: nextjs-fullstack]**
- [x] `src/scripts/forecast-ingest.test.ts`: valid batch; anchor 30% off; two-point scenario;
      probabilities all zero; unknown coin; missing credential; ceiling exceeded.
      **[Agent: nextjs-fullstack]**

**Done when:** the test file passes, and `curl` with a 30%-off anchor returns 422 while the
previously stored batch still serves.

---

## Slice 4 — Honest surfaces

- [x] `ProjectionsResponse.producer` derived from the stored row's `source` (not from which
      branch ran); `GET` sets it on every path including mock. **[Agent: nextjs-fullstack]**
- [x] Projections page renders producer + age of the displayed batch; repeated "produced on
      demand" is visible without reading logs. **[Agent: nextjs-fullstack]**
- [x] Write ingest attempts (accepted and rejected, with the reason) to
      `public.collector_status` under `forecast_ingest`. **[Agent: nextjs-fullstack]**
- [x] `/api/health` exposes `forecast_ingest` with `healthy | late | failing | never-run`,
      last accepted timestamp and last rejection reason. `late` at
      `SCHEDULED_FORECAST_LATE_AFTER_SECONDS`. **[Agent: nextjs-fullstack]**
- [x] A rejected ingest never moves the state to healthy (test).
      **[Agent: nextjs-fullstack]**

**Done when:** with no ingest for longer than the late threshold, `/api/health` reports
`late` while the page still serves the last valid batch, correctly labelled and aged.

---

## Slice 5 — The schedule

- [x] `docs/routine-forecast-prompt.md` — the exact task prompt, carrying
      `ROUTINE_PROMPT_VERSION`: fetch inputs, produce the batch to the served schema, POST it,
      report the response verbatim, never retry a 422 with adjusted numbers, never invent
      inputs. **[Agent: nextjs-fullstack]**
- [x] `docs/runbook.md` §11: cadence, both secrets, manual re-run, what to do on
      `failing` / `late`. **[Agent: nextjs-fullstack]**
- [ ] `[Operator]` Create the scheduled task from that prompt at
      `SCHEDULED_FORECAST_INTERVAL_HOURS`.
- [ ] `[Operator]` Run it once by hand; confirm verification steps 1–2 of the functional spec.
- [ ] `[Operator]` Disable it for one window; confirm exactly one paid generation and the
      `late` state (verification step 5).
- [ ] `[Operator]` After one week: `select count(*) from forecasts where created_at >
      now() - interval '7 days' and cost_usd > 0` — expect 0. Record the number in
      `product/decisions.md` either way.

**Done when:** the week's paid-generation count is recorded, and `README.md` §3 and
`product/roadmap.md` carry this spec's status.

---

*This is a technical specification, not financial advice.*
