# Technical Specification: Operator Workflows on GitHub Actions

- **Functional Specification:** `context/spec/018-operator-workflows/functional-spec.md`
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Three new workflow files under `.github/workflows/`, each `workflow_dispatch` only. They
check out the repo, install dependencies, and run scripts that already exist, with secrets
supplied as environment variables instead of `.env.local`.

Nothing under `src/` changes behaviour. The only source-tree change is a `package.json`
script pair so the CI invocation is a named, reviewable command rather than a long line
buried in YAML.

The existing `collect.yml` and `backup.yml` set the house style: a long comment block at the
top of the file explaining *why* the workflow exists and which secrets it needs, then a
short job. Follow it.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Why `npm run backfill` cannot be used as-is

```json
"backfill": "node --env-file=.env.local --import tsx src/scripts/backfill.ts"
```

`.env.local` is git-ignored and does not exist on a runner, and `--env-file` fails hard on a
missing file. Do **not** solve this by writing a `.env.local` from secrets in a step — that
puts the connection string into a file inside the workspace, where any later step or
artifact upload can pick it up.

Add sibling scripts that read the ambient environment instead:

- `backfill:ci` → `node --import tsx src/scripts/backfill.ts`
- `analog-gate` → `node --import tsx src/scripts/analog-falsification.ts`

The local scripts stay exactly as they are. Two entry points, one code path.

### 2.2 Path aliases

Both scripts import through the `@/*` alias declared in `tsconfig.json`. `tsx` resolves
`compilerOptions.paths` from the nearest `tsconfig.json`, which is the repository root — the
same resolution that already works locally. No `tsconfig-paths` dependency, no path rewrite.
Confirm this in the first dry run rather than assuming it; a module-resolution failure
surfaces in the first two seconds.

### 2.3 `.github/workflows/backfill.yml`

**Inputs**

| Input | Type | Default | Notes |
|---|---|---|---|
| `asset` | choice: `BTC` `ETH` `SOL` `ALL` | `BTC` | `ALL` fans out to a matrix |
| `from` | string | empty | `YYYY-MM-DD`; empty → the asset's `BACKFILL_START` |
| `to` | string | empty | `YYYY-MM-DD`; empty → yesterday UTC |
| `dry_run` | boolean | **`true`** | Functional spec AC 2.2 |

**Job shape**

- `strategy.matrix.asset` built from the input; `max-parallel: 1` and `fail-fast: false`.
  The memory constraint (spec 013 technical-considerations §2.4) is the reason, and it is
  worth a comment in the file so nobody "optimises" it later.
- `timeout-minutes: 90`. The budget in spec 013 is 15–30 minutes per asset; three sequential
  assets plus install must fit with room for a slow Binance.
- `concurrency: { group: catoshi-db-write, cancel-in-progress: false }`. Shared with the
  verification workflow. Queue, never cancel — cancelling a half-finished write run is worse
  than waiting for it.
- `actions/setup-node` with `cache: npm`, then `npm ci`. No `next build`: nothing here
  renders.
- Arguments are assembled conditionally — `--from` and `--to` are appended only when the
  corresponding input is non-empty, so an empty box means "use the script's default" and not
  `--from ''`.

**Environment:** `DATABASE_URL` from secrets (the pooled string — this is normal chunked
DML, not DDL). A dry run needs no database at all; supplying it unconditionally is
acceptable and simpler than branching, provided it is never printed.

**Output:** tee stdout to a file, `cat` the `=== coverage report ===` block into
`$GITHUB_STEP_SUMMARY`, upload the full log as an artifact (`retention-days: 90`, matching
`backup.yml`).

### 2.4 `.github/workflows/verify-backfill.yml`

Runs the three checks from spec 013 `tasks.md` line 43. `postgresql-client` installed the
same way `backup.yml` does it; `DATABASE_URL_UNPOOLED` for a single session.

**Input:** `expected_marker_rows` (string, required) — the total the backfill run reported.
Check 1 compares against this, not against a number derived from the same query.

**The three checks**

1. `SELECT COUNT(*) FROM snapshots WHERE COALESCE((raw->>'backfill')::boolean, false)`
   equals `expected_marker_rows`.
2. `SELECT COUNT(*) FROM snapshots WHERE COALESCE((raw->>'backfill')::boolean, false) AND funding_rate IS NOT NULL`
   equals `0`. A non-zero result means measured and inferred history have been mixed — the
   exact failure spec 013 exists to prevent.
3. Live-row precedence: insert a fixture live row at a timestamp far outside any real data
   (a synthetic asset symbol, not a real one, at a fixed sentinel `ts`), run the same upsert
   path against it, assert the live values survive, then delete the fixture. Wrap it in a
   transaction and roll back rather than relying on the delete. **Never point this check at
   a real row.**

Run `psql` with `ON_ERROR_STOP=1` and `-v` variables; capture only the scalar results.
`psql` echoes the connection string in some error paths — send its stderr through a filter,
or connect via discrete `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` variables so there is no
URL to echo.

Each check appends a `| check | expected | actual | PASS/FAIL |` row to
`$GITHUB_STEP_SUMMARY`. `set -euo pipefail`; a FAIL exits non-zero.

### 2.5 `.github/workflows/analog-gate.yml`

**Inputs:** `assets` (default `BTC,ETH,SOL`), `perms` (default `1000`).

- No database secret. The script reads Binance directly and writes to `.cache/analogs/`.
- `actions/cache` keyed on the asset list, restoring `.cache/analogs/`. First run 5–10
  minutes, later runs short. The cache holds public candles only — nothing sensitive.
- `timeout-minutes: 60`.
- Upload `.cache/analogs/out/` as an artifact with a long retention. This is the evidence
  behind a decision that determines whether spec 012 is built at all; it should outlive the
  log.
- Append the verdict block and the per-asset power curve to `$GITHUB_STEP_SUMMARY`.
- The power analysis is not optional and is not a flag — it is part of the script's normal
  run. The workflow must not add an argument that skips it, and the summary must show the
  detection-rate curve next to the verdict so "found nothing" and "could not have found
  anything" stay distinguishable.

### 2.6 Repository secrets

Already present (used by `backup.yml`): `DATABASE_URL_UNPOOLED`.
Needs adding if absent: `DATABASE_URL` (pooled).
Not needed by any workflow in this spec: `CRON_SECRET`, `COLLECT_ENDPOINT`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `COINGECKO_API_KEY`.

Grant each workflow `permissions: contents: read` explicitly. None of them writes to the
repository.

---

## 3. Impact and Risk Analysis

**System Dependencies**

- Neon Postgres — the same instance `collect.yml` writes to hourly.
- Binance public REST (`fapi.binance.com` for the backfill, `data-api.binance.vision` and
  the `api*.binance.com` fallbacks for the Gate script) and `api.alternative.me` for
  Fear & Greed history.
- `.github/workflows/collect.yml`, which may be writing a live row for the current hour
  while a backfill runs.

**Risks & Mitigations**

| Risk | Mitigation |
|---|---|
| A backfill run collides with the hourly collector on the `00:00:00Z` boundary | Already handled by the conflict predicate — the live row wins. Bound `--to` to the day before live collection began and the overlap is rare anyway. Do not add locking. |
| An accidental "Run workflow" writes junk | `dry_run` defaults to `true`; the write path announces itself in its first log line |
| Two write runs overlap | Shared `concurrency` group with `cancel-in-progress: false` |
| Runner runs out of memory on `ALL` | `max-parallel: 1`; one asset's history at a time, as the script requires |
| Binance 429/418 during a long backfill | The script's existing backoff. If a run still dies, re-run with `--from` set to the last completed date; re-runs are idempotent |
| A connection string leaks into a log or artifact | No `.env` file written into the workspace; discrete `PG*` variables for `psql`; artifacts contain script stdout only, which prints no secrets |
| Actions minutes | A private repository draws on the 2,000 free minutes/month. A full three-asset backfill is ~45 minutes and is run once. The Gate is ~10 minutes cold, less warm. Neither is close to the cap; a public repository is unmetered |
| The 60-day scheduled-workflow disable rule | Unaffected — these are `workflow_dispatch` only, and dispatching one is itself repository activity that resets the clock for `collect.yml` |

---

## 4. Testing Strategy

There is no unit test for a YAML file. The verification is the run itself, in this order —
each step is cheap and each one catches a different class of failure:

1. **`backfill.yml`, `asset: BTC`, `from`/`to` a 30-day window, `dry_run: true`.**
   Proves checkout, `npm ci`, `tsx` path-alias resolution, Binance reach, and the report
   format. Costs about two minutes. Nothing is written.
2. **The same window with `dry_run: false`.** Proves database reach and the write path on a
   range small enough to inspect by eye.
3. **`verify-backfill.yml`** with the total from step 2. All three checks must PASS. Then
   deliberately assert the workflow can fail: pass a wrong `expected_marker_rows` once and
   confirm the job goes red rather than green-with-a-warning.
4. **`backfill.yml`, `asset: ALL`, `dry_run: false`,** with `--to` bounded to the day before
   live collection began. This is spec 013 Slice 5's pending run.
5. **`verify-backfill.yml`** again against the real total.
6. **`analog-gate.yml`** with defaults. Read the verdict and the power curve; record both in
   spec 012 Slice 0. Confirm a second run hits the cache and finishes quickly.

A run that fails at step 1 or 2 is a workflow defect and belongs to this spec. A run that
completes but reports something surprising about the data is a finding for spec 013 or 012 —
record it there; do not patch it here.
