# Tasks: Operator Workflows on GitHub Actions

Plumbing, not product. Every script these workflows call is already written and tested; the
only thing being built is a way to run them somewhere with network reach.

Order matters. Slice 1 is the one that unblocks spec 013, and Slice 3 unblocks spec 012 —
which is the decision the whole analog line of work waits on.

---

## Slice 1 — Backfill on demand

- [x] Add `backfill:ci` to `package.json` — same script, ambient environment instead of
      `--env-file=.env.local`. Leave the existing `backfill` script untouched. **[Agent: nextjs-fullstack]**
- [x] Write `.github/workflows/backfill.yml`: `workflow_dispatch` only, inputs `asset`
      (`BTC`/`ETH`/`SOL`/`ALL`), `from`, `to`, `dry_run` (default **true**). House-style
      comment block at the top naming the secrets, as `collect.yml` and `backup.yml` do. **[Agent: nextjs-fullstack]**
- [x] `ALL` fans out to a matrix with `max-parallel: 1`, with a comment saying why (one
      asset's full 15m history in RAM — spec 013 technical-considerations §2.4). **[Agent: nextjs-fullstack]**
- [x] `--from` / `--to` are appended only when their inputs are non-empty. An empty box must
      mean "the script's own default", never `--from ''`. **[Agent: nextjs-fullstack]**
- [x] `timeout-minutes: 90`; `concurrency: { group: catoshi-db-write, cancel-in-progress: false }`;
      `permissions: contents: read`. **[Agent: nextjs-fullstack]**
- [x] First log line of a writing run states: writing, which asset, which bounds. **[Agent: nextjs-fullstack]**
- [x] Tee output; put the `=== coverage report ===` block into `$GITHUB_STEP_SUMMARY`; upload
      the full log as an artifact, 90-day retention. **[Agent: nextjs-fullstack]**
- [ ] Confirm `DATABASE_URL` exists as a repository secret; add it if not. **[Operator]**
- [ ] Run it: `asset: BTC`, a 30-day window, `dry_run: true`. Proves checkout, `npm ci`,
      `tsx` alias resolution, Binance reach and report format in about two minutes. **[Operator]**
- [ ] Run the same window with `dry_run: false`. Record the reported row total. **[Operator]**

**Done when:** a dry run and a small real run both come back green, and the coverage report
is readable in the run summary without opening the log.

---

## Slice 2 — Marker integrity as a job, not a request

- [x] Write `.github/workflows/verify-backfill.yml`: `workflow_dispatch`, input
      `expected_marker_rows` (required), `postgresql-client` installed as in `backup.yml`,
      `DATABASE_URL_UNPOOLED` for the session. **[Agent: nextjs-fullstack]**
- [x] Check 1 — marker row count equals `expected_marker_rows`. **[Agent: nextjs-fullstack]**
- [x] Check 2 — zero rows carry the marker together with a non-null `funding_rate`. **[Agent: nextjs-fullstack]**
- [x] Check 3 — live-row precedence, against a **synthetic sentinel row inside a rolled-back
      transaction**. It must never target a real asset or a real timestamp. **[Agent: nextjs-fullstack]**
- [x] `set -euo pipefail`, `ON_ERROR_STOP=1`, and discrete `PGHOST`/`PGUSER`/`PGPASSWORD`/
      `PGDATABASE` rather than a URL — `psql` quotes the connection string in some error
      paths. **[Agent: nextjs-fullstack]**
- [x] Each check appends `| check | expected | actual | PASS/FAIL |` to the job summary; any
      FAIL exits non-zero. **[Agent: nextjs-fullstack]**
- [x] Share the `catoshi-db-write` concurrency group with `backfill.yml`. **[Agent: nextjs-fullstack]**
- [ ] Run it with the total from Slice 1. Then run it once with a deliberately wrong total
      and confirm the job goes **red** — a check that cannot fail is not a check. **[Operator]**

**Done when:** the three checks pass on real data, and the failure path has been observed.

---

## Slice 3 — The Gate, runnable

- [x] Add `analog-gate` to `package.json` — `node --import tsx src/scripts/analog-falsification.ts`. **[Agent: nextjs-fullstack]**
- [x] Write `.github/workflows/analog-gate.yml`: `workflow_dispatch`, inputs `assets`
      (default `BTC,ETH,SOL`) and `perms` (default `1000`). **No database secret** — the
      script does not touch the database and must not be handed a credential it cannot use. **[Agent: nextjs-fullstack]**
- [x] `actions/cache` over `.cache/analogs/`, keyed on the asset list, so a re-run is minutes
      rather than 5–10. **[Agent: nextjs-fullstack]**
- [x] Upload `.cache/analogs/out/` as an artifact with long retention — this is the evidence
      behind the decision on whether spec 012 gets built. **[Agent: nextjs-fullstack]**
- [x] Job summary carries the verdict line **and** the per-asset power curve. Presenting a
      verdict without the detection-rate curve is not permitted: "found nothing" and "could
      not have found anything" must stay distinguishable (spec 012 `tasks.md`, Slice 0). **[Agent: nextjs-fullstack]**
- [x] `timeout-minutes: 60`; `permissions: contents: read`. **[Agent: nextjs-fullstack]**

**Done when:** the Gate can be started by anyone with repository access and its output
survives the log's expiry.

---

## Slice 4 — Run the pending work

This slice consumes the previous three. It writes no code.

- [ ] Determine the day before live collection began (`MIN(ts)` over rows without the
      backfill marker) and use it as `--to`. **[Operator]**
- [ ] Run `backfill.yml` with `asset: ALL`, `dry_run: false`, `to` set to that date. This is
      spec 013 Slice 5's pending run. **[Operator]**
- [ ] Run `verify-backfill.yml` against the reported total. **[Operator]**
- [ ] Tick spec 013 `tasks.md` Slice 5's two open boxes, recording the row totals, the date
      ranges and the effective sample size per horizon. **[Agent: nextjs-fullstack]**
- [ ] Run `analog-gate.yml`. Record the verdict, the three statistics against the
      permutation null, the Bonferroni result and the power curves into spec 012 Slice 0. **[Operator + Agent]**
- [ ] Update `context/product/decisions.md` §4 ("The analog falsification test has never been
      run on real data") with the outcome, and close it. **[Agent: nextjs-fullstack]**

**Done when:** spec 013 has no operator-pending task left, and spec 012's Gate has a verdict
written down — whichever way it went.

---

## Slice 5 — Write it down where it will be found

- [x] Add a section to `docs/runbook.md`: the three workflows, what each is for, what to
      pass, how to read the summary, and what to do when one goes red. **[Agent: nextjs-fullstack]**
- [x] Replace the "PENDING — operator" notes in spec 013 and spec 017 `tasks.md` with the
      name of the workflow that now does the job. **[Agent: nextjs-fullstack]** _(spec 013 Slice 5 pointers updated to `backfill.yml` / `verify-backfill.yml`. spec 017's operator items — collect.yml drift, vercel fallback, CU-h cost, restore drill, deployment audit — are not work any spec 018 workflow performs, so nothing to replace there.)_
- [x] Register spec 018 in `context/README.md` §3 and add it to `EXECUTION-PLAN.md` ahead of
      the spec 012 Gate stage, since the Gate now depends on it. **[Agent: nextjs-fullstack]**
- [x] Note in `context/product/decisions.md` **why** these runs live on Actions: measured
      03.09.2026, neither agent execution environment can reach `fapi.binance.com`,
      `api.alternative.me` or the Neon endpoint; GitHub is reachable. Without this note the
      next agent will try to run the backfill locally and conclude the project is broken. **[Agent: nextjs-fullstack]**

**Done when:** an agent starting cold learns from `context/` alone that network-bound runs go
through Actions, and finds the three workflows named.
