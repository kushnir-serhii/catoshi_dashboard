# Functional Specification: Scheduled Forecast Ingestion with On-Demand Fallback

- **Roadmap Item:** Phase 3 → An Honest Product → **Cost control while there are no users**
- **Status:** Approved
- **Author:** Serhii Kushnir
- **Depends on:** spec 019 (one forecast path, forecasts-table cache-of-record, admin auth pattern)

---

## 1. Overview and Rationale (The "Why")

Spec 019 made forecasting lazy: a batch is generated only when someone opens the page after
the 6-hour window has elapsed, and the generation is a **billed provider call**
(`openai/gpt-4o-mini` by default). That is the cheapest shape available *if the only thing
that can produce a forecast is the product itself*.

It is not. A **scheduled Claude task** (an Anthropic-hosted Routine) runs on its own
schedule, in a session that already includes a model. It can fetch the same market inputs,
produce the same forecast object, and hand it to Catoshi as data. The provider bill for that
path is **zero** — the reasoning happens inside the scheduled session, not through the
product's API key.

So this spec adds a **second producer** of forecast batches, ahead of the paid one:

| Order | Producer | Cost | When it runs |
|---|---|---|---|
| 1 | Scheduled Claude task → `POST /api/projections/ingest` | none | every `SCHEDULED_FORECAST_INTERVAL_HOURS`, unattended |
| 2 | On-demand provider call inside `GET /api/projections` (spec 019, unchanged) | billed | only when there is no fresh stored batch |

The user opening Catoshi therefore sees a forecast that is **already stored** and renders
with no model call at all. The paid path stops being the normal case and becomes what it
should have been from the start: a fallback for when the schedule did not run.

**The scheduler is not trusted.** A Routine is a convenience, not infrastructure: a run can
be skipped, a session can fail, the network path to the deployment can be closed. Everything
in §2.4 exists because of that. A missed run must cost at most one paid generation, and must
never cause a stale forecast to be presented as current (README §4 rule 1).

**The scheduled producer is not trusted either.** It sends a JSON body over HTTP; nothing
guarantees the model that produced it looked at the inputs rather than at a price it
remembers from training. Every ingest is validated against the same grid, probability and
anchor-price rules the in-product providers are held to, and is **rejected** — not stored
partially, not stored with a warning — when it fails (README §4 rule 2).

**Success looks like:** over a week in which the schedule runs normally,
`select count(*) from forecasts where created_at > now() - interval '7 days' and cost_usd > 0`
is **0**, the Projections page never shows a forecast older than the freshness window, and
every row in that period carries `source = 'routine'` with a non-null `snapshot_id`.

**What this spec is not:** it does not change the 6-hour freshness window, the forecast grid,
the scenario schema, or scoring (spec 011). It does not give the scheduled task database
credentials. It does not remove the paid path — removing the fallback is exactly the failure
mode this spec is written to avoid.

---

## 2. Functional Requirements (The "What")

### 2.1 The forecast inputs are readable as one authenticated payload

- **Acceptance Criteria:**
  - [ ] `GET /api/projections/inputs` returns everything a producer needs to make a batch:
        the target coins, the market-data blocks (`news`, `fearGreed`, `trending`, `reddit`,
        the price context), the exact `FORECAST_GRID_DAYS` array, the required output schema,
        and the `promptVersion` the result must be recorded under.
  - [ ] The route requires the ingest credential. Without it: **401**, and no upstream fetch.
  - [ ] It calls **no model**. It is the same market-data assembly the in-product providers
        use, exposed — not reimplemented (see technical-considerations §2.1).
  - [ ] The payload states the reference price per coin (latest snapshot or live price) that
        §2.4's anchor check will apply, so a producer can see the band it must land in.

### 2.2 A produced batch can be ingested and stored

- **Acceptance Criteria:**
  - [ ] `POST /api/projections/ingest` accepts a batch of per-coin projections in the schema
        `GET /api/projections/inputs` declared, and persists it through the **same**
        `persistForecasts` path as every other forecast — full bull/base/bear curves,
        probabilities, confidence, reasoning, anchor price, snapshot link.
  - [ ] Stored rows carry `source = 'routine'`, `model` = the model id the producer reports,
        `prompt_version` = the routine prompt version, `cost_usd = 0`, and null token counts.
        A zero cost is a measured fact here, not a placeholder.
  - [ ] The write is **awaited**. The response says, per coin, whether the row was stored,
        and returns a non-2xx if none was.
  - [ ] On success the projections cache tag is invalidated, so the next page load serves the
        new batch. Invalidate only **after** the write succeeds.
  - [ ] Ingest without a valid credential returns **401** and writes nothing.
  - [ ] Past `FORECAST_DAILY_INGEST_LIMIT` accepted ingests in a UTC day, the route returns
        **429**. A scheduler stuck in a loop cannot fill the table.

### 2.3 The user-facing path prefers stored, falls back to paid, and never invents

- **Acceptance Criteria:**
  - [ ] `GET /api/projections` serves a stored batch whose age is within the freshness window
        with **zero** model calls, whichever producer wrote it.
  - [ ] With no fresh stored batch, it generates through the paid provider exactly as spec 019
        specifies. Unchanged behaviour, now reached only on schedule failure.
  - [ ] If the paid fallback also fails, the response is an explicit error state. A stale batch
        is never relabelled as current, and no fabricated curve is ever returned.
  - [ ] The response carries `producer` (`scheduled` | `on-demand` | `mock`) alongside
        `generatedAt`, `service` and `model`, and the Projections page renders the producer and
        the age of what it is showing.
  - [ ] The daily **paid** generation ceiling (`FORECAST_DAILY_CALL_LIMIT`, spec 019) counts
        paid generations only. Ingested rows must not consume it, or a working schedule would
        lock the operator out of Reforecast.

### 2.4 An ingested batch is validated as strictly as a generated one

Every check below rejects the whole batch with **422** and a reason naming the failed check.

- **Acceptance Criteria:**
  - [ ] **Coverage:** each of bull, base and bear is snapped to `FORECAST_GRID_DAYS` by the
        existing snapper, and a scenario too sparse to snap rejects the batch.
  - [ ] **Probabilities:** `bull + base + bear` must normalise to 100; a set that cannot
        (all zero, negative) rejects.
  - [ ] **Anchor sanity:** `currentPrice` must be within `INGEST_ANCHOR_MAX_DEVIATION_PCT` of
        the server's own reference price for that coin. A model anchoring on a remembered
        price is the known failure mode of this whole approach (`PROMPT_VERSION = 2` exists
        because of it) and must be caught at the door.
  - [ ] **Monotone time axis and positive prices:** every `p > 0`; `d` values strictly
        increasing after snapping.
  - [ ] **Targets:** unknown coins, or coins with no `public.assets` row, are reported as
        skipped in the response and do not silently vanish.
  - [ ] A rejected ingest leaves the previous stored batch and the cache untouched.
  - [ ] Every rejection is recorded where the operator can see it (§2.5), not only in logs.

### 2.5 The state of the schedule is visible

- **Acceptance Criteria:**
  - [ ] `/api/health` reports the scheduled producer as its own component: timestamp of the
        last accepted ingest, its age, the last rejection reason if the most recent attempt
        failed, and a state of `healthy` | `late` | `failing` | `never-run`.
  - [ ] `late` is reached at `SCHEDULED_FORECAST_LATE_AFTER_SECONDS` — before the freshness
        window elapses, so the operator learns the schedule stopped *before* the product
        starts paying for it.
  - [ ] The Projections page shows when the displayed batch was produced and by which
        producer. "Produced on demand" appearing repeatedly is the visible symptom of a dead
        schedule, and must be visible rather than inferred from a bill.
  - [ ] No surface reports the schedule as healthy on the basis of a rejected ingest.

### 2.6 The scheduled task is reproducible from the repository

- **Acceptance Criteria:**
  - [ ] The exact prompt the scheduled task runs lives in the repo (`docs/routine-forecast-prompt.md`),
        versioned with the `prompt_version` value it writes. A prompt edit that does not bump
        that value is a defect (README §4 rule 3).
  - [ ] The prompt instructs: fetch inputs → produce the batch → POST it → report the
        response. It never invents inputs, and never retries a 422 with adjusted numbers.
  - [ ] `docs/runbook.md` documents the cadence, the two secrets, how to re-run the task by
        hand, and what to do when `/api/health` reports `failing`.

---

## 3. Out of Scope

- Giving the scheduled task direct database access.
- Scheduling per-coin forecasts for coins outside `DEFAULT_FORECAST_TARGETS`.
- News classification through the same route — it stays as spec 019 left it, off by flag.
- Replacing GitHub Actions for snapshot collection. That pipeline calls no model and is
  unaffected.
- Comparing routine-produced accuracy against provider-produced accuracy. The data to do it
  is recorded here (`source` per row); the analysis is spec 011's.

---

## 4. How This Is Verified

1. Trigger the scheduled task by hand. `/api/health` moves to `healthy`, and
   `select source, model, cost_usd from forecasts order by created_at desc limit 3` shows
   three `routine` rows with `cost_usd = 0`.
2. Open Projections immediately after: the three lines redraw, `producer` reads `scheduled`,
   and no new `as_of` group appears — the page made no model call.
3. POST an ingest with an anchor price 30% off the live price: **422**, reason names the
   anchor check, no new row.
4. POST an ingest with no credential: **401**, no new row.
5. Disable the task for longer than the freshness window, then open the page: exactly one
   paid generation appears (`cost_usd > 0`), `producer` reads `on-demand`, and `/api/health`
   reports the schedule as `late`.
6. After a week of normal running: zero rows with `cost_usd > 0`.

---

*This is a technical specification, not financial advice.*
