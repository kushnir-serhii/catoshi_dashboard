# Functional Specification: Forecast Cost Control and Route Consolidation

- **Roadmap Item:** Phase 3 → An Honest Product → **Cost control while there are no users**
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Catoshi has no users. The only person opening it is its author, testing it. In that state
every model call the product makes on its own buys nothing, and three defects make it make
more of them than anyone asked for. All three were measured in the working tree on
05.09.2026.

| # | Defect | Cost |
|---|---|---|
| 1 | `GET /api/projections` puts the raw `?service` / `?model` query values into the `unstable_cache` key **before** validating them. `generateForecast` validates internally and falls back to the default model, but the key is already different | Unbounded. `?model=a1`, `a2`, … is one paid model call per unique string, from a browser address bar |
| 2 | `POST /api/projections/refresh` is public — no authentication, no rate limit — and calls `revalidateTag('projections', { expire: 0 })` **before** generating | One request = one model call, plus a second one on the next `GET`, because the shared cache entry was emptied first. A failed generation leaves no forecast at all |
| 3 | The refresh route never calls `persistForecasts` | Every Reforecast result — and every forecast for a coin outside `DEFAULT_FORECAST_TARGETS`, which is the *only* way to get one — is absent from `public.forecasts`. Spec 011 calibration cannot see it, and its `cost_usd` is never recorded |

The reason all three exist is one structural fact: `route.ts` and `refresh/route.ts`
implement the same sequence twice, and have drifted. Roughly 200 duplicated lines,
including two copies of `COIN_CONFIGS`, `seededRng`, `buildScenario` and `buildProjection`.

Separately, the product makes exactly one model call in the background: `classifyNews`,
inside `/api/collect`, reached hourly by `.github/workflows/collect.yml` and daily by the
Vercel cron. Nothing else in the background calls a model — in particular, **no scheduled
job touches the projections route**, so forecasting is already lazy. This spec makes that
property explicit and enforced rather than accidental.

**Snapshot collection stays on.** It calls no model and costs nothing but free-tier API
calls, and Binance serves only ~30 days of derivatives history: an hour not collected is an
hour lost permanently and unreachable by backfill (spec 017, `decisions.md` §10). Pausing
collection to save AI tokens would save zero tokens and destroy data.

**Success looks like:** the author leaves the site open all day, clicks around, and at the
end of the day `select count(distinct as_of) from forecasts where created_at >= current_date`
equals the number of 6-hour windows in which he actually opened the page, plus the number of
times he pressed Reforecast himself. No other number is possible.

**What this spec is not:** it does not change the 6-hour freshness window (kept
deliberately), does not remove the Signals page's news cards (already-classified rows keep
rendering), does not introduce accounts (spec 016 removed those on purpose — the operator
switch here is a shared secret, not a user system), and does not build quota or billing.

---

## 2. Functional Requirements (The "What")

### 2.1 A forecast is generated on demand, once per window

- **Acceptance Criteria:**
  - [ ] The first request for projections after the freshness window has elapsed generates
        one forecast batch. Every request inside the window is served from storage with **no
        model call**.
  - [ ] The window length is a single named constant, and its value stays 6 hours.
  - [ ] A redeploy inside the window does **not** cause a new model call: after the platform
        cache is gone, the stored forecast still answers the request.
  - [ ] No scheduled job requests projections. Verifiable: `/api/projections` appears in no
        file under `.github/workflows/` and in no `crons` entry of `vercel.json`.
  - [ ] With `NEXT_PUBLIC_USE_MOCK_DATA=true`, no model is called on any path.

### 2.2 An unrecognised model or service can never cause a model call

- **Acceptance Criteria:**
  - [ ] `GET /api/projections` validates `service` / `model` against
        `ALLOWED_FORECAST_MODELS` **before** any cache key is derived from them.
  - [ ] An invalid pair is served by the same cache entry as the default pair. Fifty requests
        with fifty different invalid `?model=` values produce **at most one** model call —
        and zero if the default entry is already warm. Covered by a test.
  - [ ] The response states which service and model actually produced the forecast, never
        the requested one.

### 2.3 Reforecast is authenticated, capped, and honest about both

- **Acceptance Criteria:**
  - [ ] `POST /api/projections/refresh` without valid operator credentials returns **401**
        and makes **zero** model calls and zero market-data fetches.
  - [ ] With valid credentials it makes exactly one model call for the requested targets.
  - [ ] The cache is invalidated **only after** a generation succeeds. A failed generation
        leaves the previous forecast intact and returns a non-2xx.
  - [ ] A successful refresh does not cause the next `GET` to generate again. One click, one
        model call.
  - [ ] Past `FORECAST_DAILY_CALL_LIMIT` generations in a UTC day the route returns **429**
        with the current count and the limit. The counter is derived from `public.forecasts`,
        not from memory, so it survives a redeploy.
  - [ ] If the count cannot be read, the refresh is **refused** (fail closed). A missing
        count must never be read as "no calls yet". This applies to refresh only — a read
        failure never blocks the `GET` path.
  - [ ] The UI renders the locked state and the limit state as what they are — "operator
        unlock required", "daily limit reached (n/N)". No disabled-looking button with no
        reason, no toast that claims success, no silently unchanged chart.

### 2.4 Every model call is recorded

- **Acceptance Criteria:**
  - [ ] Both paths write to `public.forecasts` — scenarios, anchor price, confidence,
        reasoning, model, `prompt_version`, `schema_version`, token counts and `cost_usd` —
        through the same function.
  - [ ] The refresh path awaits that write and reports in its response whether it succeeded.
        The `GET` path keeps its fire-and-forget write (spec 011 AC 2.6: the database must
        never delay or fail a user-facing response), and logs a failure loudly.
  - [ ] A coin with no `public.assets` row is still skipped with a warning (existing
        behaviour), and the response does not imply it was stored.

### 2.5 Background classification has an off switch that does not lie

- **Acceptance Criteria:**
  - [ ] With classification disabled by environment flag, a collection run makes **no** model
        call. News ingest and the publication of already-classified rows continue.
  - [ ] The run reports that source as explicitly disabled — not as a successful
        classification, and not as a failure either.
  - [ ] `/api/health` and the Signals page show "classification paused" as its own state.
        Zero new classified items with no explanation is not acceptable (README §4 rule 1).
  - [ ] Re-enabling the flag restores the previous behaviour with no code change and no
        backfill of the paused period. Items ingested while paused stay unclassified and are
        picked up by the next enabled run.

### 2.6 One forecast path in the code

- **Acceptance Criteria:**
  - [ ] One module owns the sequence validate → fetch market data → generate → resolve
        snapshot → persist. Both routes call it and neither reimplements any step.
  - [ ] The mock builders live in exactly one module. `COIN_CONFIGS`, `seededRng`,
        `buildScenario` and `buildProjection` each appear once in the source tree.
  - [ ] Deleting the shared module breaks both routes at compile time. That is the point.

---

## 3. Out of Scope

- Changing the 6-hour window, the batched prompt, or the model defaults.
- User accounts, sessions or roles. The operator unlock is one shared secret.
- Streaming, per-coin scheduling, or precomputing forecasts for coins nobody opened.
- Any change to how forecasts are scored — that is spec 011.

---

## 4. How This Is Verified

1. `select as_of, count(*), max(cost_usd) from forecasts where created_at >= current_date
   group by as_of order by as_of;` — one `as_of` group per generation. The count of groups is
   the count of model calls that day.
2. Fifty `GET` requests with distinct invalid `?model=` values, then the query above: the
   group count must not have increased by fifty.
3. `curl -X POST` the refresh route with no header: 401, and no new group.
4. Pressing Reforecast once with the operator cookie set: exactly one new group, and the
   chart's three lines redraw from it.
5. A collection run with classification disabled: `/api/health` shows the paused state, and
   the day's group count is unchanged.

---

*This is a technical specification, not financial advice.*
