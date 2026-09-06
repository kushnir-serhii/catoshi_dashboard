# Technical Considerations: Scheduled Forecast Ingestion with On-Demand Fallback

Spec 020. Read `functional-spec.md` first. This file records how it is built and which
trade-offs were taken, including the ones that were rejected and why.

---

## 1. Shape of the change

```
Scheduled Claude task (Anthropic cloud, no repo access, no DB access)
   │  GET  /api/projections/inputs      Bearer FORECAST_INGEST_SECRET
   │        → market data + grid + output schema + reference prices + promptVersion
   │  (produces the batch inside the session — no provider API call, no cost)
   └─ POST /api/projections/ingest      Bearer FORECAST_INGEST_SECRET
            → validate → snap → persistForecasts(source='routine', cost_usd=0)
            → revalidateTag('projections')

GET /api/projections  (unchanged order, spec 019)
   1. fresh stored batch  → serve, zero model calls          ← now normally written by the task
   2. otherwise           → runForecast() through the paid provider
   3. failure             → explicit error, never a stale or fabricated curve
```

No new table. `public.forecasts.source` and `.model` are `text`, `prompt_version` is `text`,
`cost_usd` is nullable numeric — a routine-produced row fits the existing schema exactly.
That is deliberate: two producers writing two shapes would split spec 011's calibration
sample in a way no query could reunite.

---

## 2. Decisions

### 2.1 The inputs endpoint exposes the existing assembly, it does not reimplement it

`GET /api/projections/inputs` calls `fetchMarketData(DEFAULT_FORECAST_TARGETS)` and
`buildPriceContext` — the same functions `src/lib/forecast/claude.ts` and `openai.ts` use —
and serialises the result. The grid comes from `FORECAST_GRID_DAYS`, the schema from the same
constant the provider tool-schema is built from. If the two ever drift, the routine is
forecasting against inputs the product does not use, and the accuracy record silently mixes
two experiments. Extract the prompt-input assembly into `src/lib/forecast/inputs.ts`, used by
the endpoint and by both providers.

Cache the endpoint with `unstable_cache` on the same 6-hour tag family: the task is the only
caller, but an unauthenticated flood must not become a CoinGecko/RSS amplifier.

### 2.2 Why the task does not simply call `POST /api/projections/refresh`

That route runs `runForecast`, which calls the paid provider. Using it from a schedule would
reintroduce exactly the background billing spec 019 removed, plus it counts against the
operator's daily ceiling. The task produces the forecast itself; ingest is a **write** route,
not a generate route, and must never be able to trigger a provider call.

### 2.3 Why the task does not write to Neon directly

It would need `DATABASE_URL` in a chat-session environment, and it would bypass every
validation in functional-spec §2.4 as well as `persistForecasts`'s asset-id resolution and
snapshot linking. The HTTP boundary is what makes the producer untrusted-by-construction.
The same argument applies to the "commit a JSON file to the repo and let Vercel rebuild"
variant: it also gives the task write access to the source of truth, and it makes every
forecast a commit.

### 2.4 Authentication

Reuse the spec 019 pattern: `matchesAdminSecret` (`crypto.timingSafeEqual`) against
`FORECAST_INGEST_SECRET`, accepted as `Authorization: Bearer`. A **separate** secret from
`ADMIN_SECRET`: the ingest credential lives in a scheduled task's prompt configuration, which
is a different blast radius from the operator's browser cookie. Unset secret ⇒ **503**, never
open (same three-way result type as `checkAdminAuth`).

No cookie path for ingest — it is machine-to-machine only.

### 2.5 Validation lives in one pure module

`src/lib/forecast/ingest.ts`: `validateIngestBatch(payload, references) → { projections, rejections }`,
pure, no I/O, unit-tested per README §4 rule 6. It reuses `snapScenarioToGrid` and
`normalizeProbabilities` from `gridSnap.ts` rather than re-deriving them — note those two
helpers are currently duplicated inside `claude.ts`; fold the copies into `gridSnap.ts` in
Slice 2 (§ rule 5).

The anchor check needs a reference price the server trusts: `getLatestSnapshot(symbol)` when
it is within `FORECAST_SNAPSHOT_MAX_AGE_MINUTES`, otherwise the live price used by
`/api/prices`. If neither is available, the ingest is **refused** (fail closed) — an
unverifiable anchor is the one thing this design cannot afford to wave through.

`INGEST_ANCHOR_MAX_DEVIATION_PCT` starts at **5**. It is a constant, not a literal, and it is
expected to be tightened once a week of accepted ingests shows the real spread.

### 2.6 Type changes and their ripple

`ProjectionData.service` is typed `'claude' | 'openai'`. Extend to
`'claude' | 'openai' | 'routine'` and let the UI label it ("Scheduled analysis" vs the model
name). The alternative — storing `source = 'claude'` and distinguishing by model id — makes
`select ... group by source` in spec 011 dishonest, which is worse than a compiler sweep.

`ProjectionsResponse` gains `producer: 'scheduled' | 'on-demand' | 'mock'`, derived from the
row's `source` rather than from which branch of the route ran, so a stored batch served
after a redeploy still reports who made it.

### 2.7 The daily ceilings are two different counters

`FORECAST_DAILY_CALL_LIMIT` (spec 019) must count **paid** generations only:
`getDailyForecastGenerationCount` gains a `where cost_usd > 0` (equivalently
`source <> 'routine'`) predicate. Without it, four scheduled ingests a day would silently eat
the operator's Reforecast budget. `FORECAST_DAILY_INGEST_LIMIT` is a separate, larger ceiling
protecting the table from a looping scheduler.

### 2.8 Cadence and lead time

`SCHEDULED_FORECAST_INTERVAL_HOURS = 3` against a 6-hour freshness window. One missed run
therefore costs nothing: the next run still lands inside the window. Two consecutive misses
cost exactly one paid generation, and `SCHEDULED_FORECAST_LATE_AFTER_SECONDS`
(= 2 × interval) has already flipped `/api/health` to `late` by then.

### 2.9 Observability

Record ingest attempts in `public.collector_status` (spec 017, `0007_collector_status.sql`)
under a `forecast_ingest` component key rather than inventing a table: it already carries
last-run, ok/failed and a message, and `/api/health` already reads it. A rejection writes the
failed state with the failed check's name as the message.

---

## 3. Risks

| Risk | Handling |
|---|---|
| **The scheduled session cannot reach the deployment** (egress policy, or the deployment is not public) | This is the gate in Slice 1. If a scheduled run cannot `GET /api/projections/inputs`, stop and report — the rest of the spec is unbuildable as written, and the fallback plan is a GitHub Actions job driving the Anthropic API, which is the paid path again |
| A scheduler run silently stops | `/api/health` state + the Projections page's producer label + the paid fallback. Cost of the failure is bounded at one generation per window |
| Producer anchors on a remembered price | Anchor deviation check, fail closed when no reference exists |
| Producer output drifts from the provider schema over time | Schema is served by the inputs endpoint, and the ingest validator is the same code path both producers' output must satisfy |
| Two producers make the accuracy record incomparable | `source` and `prompt_version` are stored per row; spec 011 groups by both already |
| Secret leaks from the task configuration | Ingest can only write forecast rows; it cannot generate, cannot read the database, and is capped per day. Rotate by changing one env var |

---

## 4. Files expected to change

| File | Change |
|---|---|
| `src/lib/forecast/inputs.ts` | **new** — prompt-input assembly extracted from the providers |
| `src/lib/forecast/ingest.ts` | **new** — pure validation/normalisation of an ingested batch |
| `src/app/api/projections/inputs/route.ts` | **new** — authenticated inputs payload |
| `src/app/api/projections/ingest/route.ts` | **new** — authenticated write path |
| `src/lib/forecast/gridSnap.ts` | absorbs the duplicated snapper/normaliser from `claude.ts` |
| `src/lib/forecast/claude.ts`, `openai.ts` | use the shared input assembly and shared helpers |
| `src/lib/db/analytics.ts` | `persistForecasts` accepts an explicit source/model/cost triple; `getDailyForecastGenerationCount` counts paid rows only |
| `src/app/api/projections/route.ts` | reports `producer`; ordering otherwise unchanged |
| `src/app/api/health/route.ts` | `forecast_ingest` component |
| `src/consts/projections.ts` | `SCHEDULED_FORECAST_INTERVAL_HOURS`, `SCHEDULED_FORECAST_LATE_AFTER_SECONDS`, `INGEST_ANCHOR_MAX_DEVIATION_PCT`, `FORECAST_DAILY_INGEST_LIMIT`, `ROUTINE_PROMPT_VERSION`, `ROUTINE_SOURCE` |
| `src/data/types.ts` | `service` union + `producer` on `ProjectionsResponse` |
| Projections UI | producer + age label |
| `.env.example` | `FORECAST_INGEST_SECRET` |
| `docs/routine-forecast-prompt.md` | **new** — the versioned scheduled-task prompt |
| `docs/runbook.md` | §9 scheduled forecast production |

---

*This is a technical specification, not financial advice.*
