# Technical Specification: Forecast Cost Control and Route Consolidation

- **Functional Specification:** `context/spec/019-forecast-cost-control/functional-spec.md`
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Three moves, in this order:

1. **One owner for the forecast sequence.** A new `src/lib/forecast/run.ts` performs
   validate → `fetchMarketData` → `generateForecast` → snapshot resolution → `persistForecasts`.
   `src/app/api/projections/route.ts` and `.../refresh/route.ts` become thin callers. The mock
   builders move to `src/lib/forecast/mock.ts` and are imported, not copied.
2. **`public.forecasts` becomes the cache of record**, behind the existing platform cache.
   Lookup order on a request: Next.js Data Cache → `forecasts` table → the model. The table
   already stores everything the chart needs, so a redeploy or a cold region costs a database
   read, not a model call.
3. **The manual path gets a lock and a ceiling.** The refresh route requires an operator
   credential and refuses past a daily generation count read from the same table.

Nothing about the prompt, the provider modules, the 6-hour window or the chart changes.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 `src/lib/forecast/run.ts`

```ts
export interface RunForecastOptions {
  targets: readonly ForecastTarget[];
  service: string;
  model: string;
  /** true on the manual path: the caller reports whether the row was stored. */
  awaitPersist?: boolean;
}

export interface RunForecastResult {
  projections: ProjectionData[];
  generatedAt: string;
  service: string;   // validated, i.e. what actually ran
  model: string;
  persisted?: boolean;
}
```

Body: `validateForecastParams` (moved out of the two private copies into
`src/lib/forecast/params.ts`, exported and unit-tested), then `fetchMarketData`, then
`generateForecast`, then the snapshot resolution block that `route.ts` already has —
including the `FORECAST_SNAPSHOT_MAX_AGE_MINUTES` age limit and its comment about why a stale
snapshot is recorded as `null` rather than linked. Move that comment with the code; it is the
reason the check exists.

`awaitPersist: false` keeps the current `void persistForecasts(...).catch(...)` semantics.
`true` awaits it and sets `persisted`, and a rejection is reported, never thrown into the
response path.

### 2.2 Reading forecasts back: `getLatestForecasts`

New in `src/lib/db/analytics.ts`, the mirror of `persistForecasts`:

```ts
getLatestForecasts(symbols: string[], maxAgeMs: number): Promise<ProjectionData[]>
```

- `select distinct on (f.asset_id) …` joined to `public.assets`, `where a.symbol = any($1)
  and f.as_of >= now() - $2::interval`, ordered `by f.asset_id, f.as_of desc`.
- **`schema_version` must equal `PROJECTION_SCHEMA_VERSION`, in the query.** A row written
  under an older shape is a miss, never a partial render. This is the one guard that keeps a
  future schema bump from resurrecting incompatible curves.
- Map back to `ProjectionData`: `scenarios->'bull' | 'base' | 'bear'` to the point arrays,
  `scenarios->'probabilities'` to `scenarioProbabilities`, `anchor_price` to `currentPrice`,
  `as_of` to `generatedAt`, `source` to `service`. A row missing any of those is a miss for
  that symbol — do not substitute a default.
- **Partial coverage is a miss for the batch.** If two of three targets are fresh, generate
  for all three: the prompt is batched, so one call covers them, and mixing a fresh forecast
  with a stale one on the same chart is exactly the class of defect `decisions.md` §3 is about.
- Coins outside `DEFAULT_FORECAST_TARGETS` have no `assets` row, so they are never stored and
  never read back. They stay live-only per browser session, and after Slice 3 the UI says so
  instead of implying persistence.

### 2.3 The `GET` route

```
validate(service, model)            ← before the key exists (defect 1)
  └─ unstable_cache(key=['projections', validService, validModel],
                    revalidate = FORECAST_TTL_SECONDS, tags=['projections'])
       └─ getLatestForecasts(symbols, FORECAST_TTL_MS)   → hit: return it
       └─ runForecast({ awaitPersist: false })           → miss: one model call
```

Keeping `unstable_cache` as the outer layer matters for cost beyond tokens: Neon's compute
sleeps after five minutes idle and bills a five-minute minimum per wake
(`docs`/schema notes). The platform cache absorbs the ordinary in-window request without
touching the database; the database read happens only when that cache is cold.

`FORECAST_TTL_SECONDS = 21600` moves to `src/consts/projections.ts` next to
`PROJECTION_SCHEMA_VERSION` (README §4 rule 5 — the value is used in three places now).

### 2.4 The refresh route

- Delete the local mock block; import from `src/lib/forecast/mock.ts`.
- Auth: `Authorization: Bearer <ADMIN_SECRET>` **or** an `catoshi_admin` HttpOnly cookie.
  Compare with `crypto.timingSafeEqual` on equal-length buffers, following the existing
  `CRON_SECRET` check in `src/app/api/collect/route.ts` (~line 43) — same helper, extracted if
  it is easier to share than to repeat.
  The cookie is set by `GET /api/admin/unlock?key=…` (`HttpOnly`, `SameSite=Lax`, `Secure` in
  production, 30 days) and cleared by `?key=` empty. This is an operator switch, not an
  account: no user table, no session store, one secret in the environment.
  With `ADMIN_SECRET` unset the route returns **503 with an explanatory message**, never open.
- Order of operations: generate → `persistForecasts` (awaited) → `revalidateTag('projections')`
  → respond. Never the reverse (defect 2).
- Because the tag is invalidated after a successful generation, the following `GET` misses the
  platform cache, reads the row that was just written, and returns it — one model call per
  click (FR 2.3).

### 2.5 The daily ceiling

```sql
select count(distinct as_of) from public.forecasts
 where created_at >= date_trunc('day', now() at time zone 'utc');
```

`as_of` is shared by every row of one batch, so distinct `as_of` counts generations, not rows.
Compared against `FORECAST_DAILY_CALL_LIMIT` (`src/consts/projections.ts`, default 20).
Over the limit → 429 with `{ count, limit }`. Query failure → 503, refusal, logged: a count
that cannot be read is not zero. The `GET` path never runs this query — a database problem
must not stop a user-facing forecast.

### 2.6 The background classification flag

`NEWS_CLASSIFY_ENABLED` (`.env.example`, default `true`; the author sets `false` while testing
alone). Read at the call site in `src/app/api/collect/route.ts`, not inside `classifyNews`, so
that the disabled state is visible where the run is reported:

```ts
sourcesBySymbol.news = [...(sourcesBySymbol.news ?? []),
  { source: 'news:classify', ok: true, disabled: true }];
```

`disabled` is a new optional field on that source type. `src/lib/freshness.ts` and
`/api/health` must surface it as its own state, and the Signals page must render "news
classification paused" rather than an empty news section. Reusing `ok: false` would put a
deliberate pause into the same bucket as a broken provider; reporting `ok: true` alone would
claim work that did not happen. Both are the failure mode README §4 rule 1 exists to prevent.

Ingest and publish are untouched: they call no model, and publish only copies rows that were
already classified.

### 2.7 Deliberately not changed

- The SWR `refreshInterval` of one hour in `src/hooks/useProjections.ts`. Those requests are
  cache hits and cost no tokens; a serverless invocation is not the cost being controlled here.
- The 6-hour window itself. Recorded as the author's decision, 05.09.2026.
- `NEXT_PUBLIC_USE_MOCK_DATA` mock mode. It is an explicit flag, not a fallback on error, so
  README §4 rule 1 does not apply to it — but the guard must stay an explicit check on the
  flag, never a `catch` branch.

---

## 3. Risks and Trade-Offs

| Risk | Decision |
|---|---|
| The database read wakes Neon and bills five minutes | Accepted, and bounded: the read runs only on a platform-cache miss, which after this spec is a redeploy or a cold region, not a page view |
| One shared secret for the operator unlock | Accepted for a single-operator deployment. Spec 016 removed accounts on purpose; adding one back for a button would be a bigger regression than the risk |
| Fail-closed ceiling could block the author | The limit is an environment value, and the 429 body says the count and the limit, so the state is never a mystery |
| `distinct as_of` mis-counts if two batches share a timestamp to the millisecond | Practically impossible (`generatedAt` is per-call `new Date().toISOString()`) and it would under-count by one. Cheaper than adding a counter table |

---

## 4. Testing

House style: `tsx` scripts under `src/scripts/`, run directly, in the pattern of
`src/scripts/price-context.test.ts`.

- `src/scripts/forecast-params.test.ts` — validation: known pairs pass through; unknown
  service, unknown model, empty strings and fifty junk values all collapse to the default
  pair, and the derived cache key is identical for all of them.
- `src/scripts/forecast-store.test.ts` — `getLatestForecasts` mapping: a well-formed row round
  trips to `ProjectionData`; a row with a different `schema_version` is a miss; a row missing
  `bear` is a miss; two-of-three coverage is a batch miss.
- `src/scripts/forecast-guard.test.ts` — the ceiling counts generations not rows, a failed
  count refuses, and the credential comparison is length-safe and rejects a wrong secret.

Each test must fail with the guard removed. A guard whose test still passes without it is not
a guard (`decisions.md`, spec 018 Slice 2 precedent).

Per slice: `npm run lint`, `npx tsc --noEmit`, the slice's own script.
