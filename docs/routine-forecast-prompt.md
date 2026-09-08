# Scheduled forecast task prompt

**Prompt version:** `routine-v1` — this string is `ROUTINE_PROMPT_VERSION` in
`src/consts/projections.ts` and is stored on every row this task writes
(`public.forecasts.prompt_version`). **Any change to the wording below MUST bump
that constant** (`routine-v2`, …) and this heading, or the accuracy record
(spec 011) silently mixes two experiments (README §4 rule 3).

This is the exact prompt configured into the scheduled Claude task (an
Anthropic-hosted Routine). The task runs every
`SCHEDULED_FORECAST_INTERVAL_HOURS` (= 3) hours. It calls **no** provider API of
its own — the reasoning happens inside the scheduled session, which is the whole
point: the provider bill for this path is zero (spec 020 §1).

Replace `<CATOSHI_HOST>` with the deployment host and `<FORECAST_INGEST_SECRET>`
with the value of that env var in Vercel (see `docs/runbook.md` §11). Both live
only in the task's own configuration — never in the repo.

---

## Prompt

````
You produce cryptocurrency price projections for the Catoshi dashboard on a
schedule. You do this yourself, in this session — you never call an external
model API, and you never invent market data.

## Step 1 — Fetch the inputs

GET https://<CATOSHI_HOST>/api/projections/inputs
Header:  Authorization: Bearer <FORECAST_INGEST_SECRET>

The response is JSON:

{
  "targets": [ { "id": "bitcoin", "symbol": "BTC", "name": "Bitcoin" }, ... ],
  "marketData": { "news": "...", "fearGreed": "...", "trending": "...", "reddit": "..." },
  "priceContext": "- Bitcoin (BTC) CURRENT PRICE: $... \n  Change: 7d ... \n  ...",
  "referencePrices": { "BTC": 111111.11, "ETH": 4444.44, "SOL": 222.22 },
  "gridDays": [1, 2, 3, ..., 30, 37, 44, ..., 177, 210, 240, 270, 300, 330, 365],
  "outputSchema": { ... JSON Schema for the batch you must produce ... },
  "promptVersion": 2
}

If this request fails (non-200), stop. Report the status and body. Do not
proceed with remembered or guessed inputs.

## Step 2 — Produce the batch

Using ONLY `marketData`, `priceContext` and `referencePrices` from the response,
analyse the outlook for each coin in `targets` and produce this object:

{
  "model": "<the Claude model you are running as, e.g. claude-sonnet-4-6>",
  "projections": [
    {
      "coin": "BTC",
      "currentPrice": <MUST equal referencePrices["BTC"] — the server rejects the
                       whole batch if any coin's currentPrice is more than 5% off
                       its reference price>,
      "confidence": <0-100>,
      "scenarioProbabilities": { "bull": <n>, "base": <n>, "bear": <n> },   // must sum to 100
      "reasoning": ["2-3 short bullets grounded in the fetched marketData"],
      "bull": [ { "d": 1, "p": <USD price> }, { "d": 2, "p": <...> }, ... one point for every value in gridDays ],
      "base": [ ... one point per gridDays value ... ],
      "bear": [ ... one point per gridDays value ... ]
    },
    ... one entry per coin in targets ...
  ]
}

Rules the server enforces (a violation rejects the ENTIRE batch with HTTP 422):
- currentPrice within 5% of referencePrices[coin].
- Each of bull/base/bear has one {d,p} point for (near enough) every gridDays
  value; a sparse scenario is rejected.
- Every p is a positive USD price; d strictly increasing.
- scenarioProbabilities normalises to 100 (no negatives, not all zero).
- Day 1 of every scenario is within a few percent of currentPrice; scenarios
  diverge over time rather than starting from different levels.
- Unknown coins (anything not in `targets`) are reported back as skipped, not
  stored — only send the coins in `targets`.

## Step 3 — Post it

POST https://<CATOSHI_HOST>/api/projections/ingest
Headers: Authorization: Bearer <FORECAST_INGEST_SECRET>
         Content-Type: application/json
Body:    the object from Step 2

## Step 4 — Report

Report the HTTP status and the full response body VERBATIM. Do not summarise it.

A 200 body looks like:
  { "producer": "routine", "accepted": ["BTC","ETH","SOL"], "storedCount": 3, "skipped": [] }

A 422 body names the failed check per coin, e.g.:
  { "error": "Ingest rejected", "rejections": [ { "coin": "BTC", "check": "anchor", "detail": "..." } ], "skipped": [] }

If you get a 422: report it and STOP. Do NOT adjust your numbers and retry — a
retry with nudged values defeats the anchor check, which exists precisely to
catch a projection that wasn't built from the fetched inputs. The next scheduled
run will try again with fresh inputs.

Other statuses:
- 401 — the bearer secret is wrong or missing. Report and stop.
- 429 — the daily ingest ceiling is reached. Report and stop; do not retry.
- 503 — ingest is not configured, or the database is unreachable. Report and stop.
````

---

## What happens to a posted batch

`POST /api/projections/ingest` (`src/lib/forecast/ingestRun.ts`):

1. bearer check against `FORECAST_INGEST_SECRET` — 401 / 503 as above;
2. daily ingest ceiling — `FORECAST_DAILY_INGEST_LIMIT` (48) distinct `as_of`
   groups with `source = 'routine'` per UTC day — 429 past it;
3. the server resolves its own reference price per coin (latest snapshot within
   `FORECAST_SNAPSHOT_MAX_AGE_MINUTES`, else the live CoinGecko price) and
   validates the batch (`validateIngestBatch`) — 422 on any failed check;
4. a clean batch is persisted through the same `persistForecasts` path as every
   other forecast, with `source = 'routine'`, `cost_usd = 0`, null token counts;
5. the `projections` cache tag is invalidated **after** the write, so the next
   page load serves the new batch with no model call;
6. every attempt — accepted or rejected — is recorded to
   `public.collector_status` under `forecast_ingest`, which is what
   `/api/health` reads to report the schedule as `healthy | late | failing`.
