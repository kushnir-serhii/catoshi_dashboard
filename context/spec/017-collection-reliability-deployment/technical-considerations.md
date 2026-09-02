# Technical Specification: Collection Reliability & Deployment

- **Functional Specification:** `./functional-spec.md`
- **Status:** Approved
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Mostly verification, plus one small read-only endpoint. The scheduling, backup and fallback
machinery is already committed (`.github/workflows/collect.yml`, `.github/workflows/backup.yml`,
`vercel.json`); this spec proves it works and makes its state observable.

The one piece of new code is a health endpoint. Everything else is a check, a document, or a
correction to something that reports a time it should not.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Health endpoint — `GET /api/health`

Read-only, unauthenticated, no secret in the response. Per tracked asset:

- newest snapshot `ts` and its age in minutes;
- count of snapshots in the last 24 hours (expected 24);
- per-collector last-success time — Binance futures, klines, ETF flows, Fear & Greed, and
  the news feed once spec 015 ships.

Returns a non-OK HTTP status when the newest snapshot exceeds `SNAPSHOT_STALE_MINUTES`, so a
free external uptime checker can watch one URL and be the alerting layer.

Two things it must not do: expose a connection string, credential or raw row; and hit an
external API. It is a database read, and it must stay cheap enough to poll every few minutes
against a Neon instance that sleeps.

### 2.2 Source status

`/api/collect` already tracks per-source outcomes within a run (`SourceStatus`). Persist the
last success per source so the health endpoint can report it across runs — a small
`collector_status` table, or a jsonb row in an existing settings table. Choose one and write
it down; the important property is that a source failing for six hours is distinguishable
from the whole run failing once.

### 2.3 Freshness audit

Grep for `new Date()` and `Date.now()` in every component and route that renders an age or a
"last updated" value. Each hit is either justified in a comment or replaced with a timestamp
read from the data. This is a regression check on `decisions.md` §3, instance 2.

Cover: `SignalsPage`, `MarketsPage`, `ProjectionsPage`, `ForecastContextPanel`, and the SWR
hooks under `src/hooks/`.

Add `SNAPSHOT_STALE_MINUTES` to `src/consts/collect.ts` and use the same threshold for the
health endpoint and the UI staleness warning. Two thresholds will diverge.

### 2.4 Scheduler verification

- Read the Actions run history for `collect.yml`: confirm it fires, and record the observed
  drift. Best-effort scheduling drifts by minutes; the server-side truncation to the hour is
  what keeps that from producing duplicate rows. Verify that truncation is actually
  server-side and not taken from the firing moment.
- Verify the daily `vercel.json` cron fires and is idempotent against the hourly run — running
  both in the same hour must produce one row, not two.
- Add the 60-day inactivity note to the README.

### 2.5 Backup verification

- Confirm `backup.yml` runs weekly and produces a non-empty dump; verify where it is stored
  and for how long.
- **Perform one real restore** into a throwaway Neon branch — free, copy-on-write, and the
  reason branching was one of the arguments for Neon. Write the procedure down.
- Confirm `scripts/migrate.mjs` uses `DATABASE_URL_UNPOOLED` and the application uses the
  pooled `DATABASE_URL`. DDL through a pooler fails in ways that only appear later.

### 2.6 Deployment audit

- Environment variables: reconcile `.env.example`, `.env.local` and Vercel production. Every
  used variable is listed in `.env.example`; every entry there is still used. Remove stale
  ones — `CRYPTOPANIC_API_KEY` is a known example, since no code path calls that API.
- `NEXT_PUBLIC_USE_MOCK_DATA=false` in production, and confirm by inspection that no route
  falls back to mock data on an upstream error. This is the original defect
  (`decisions.md` §3, instance 1); the check belongs here permanently.
- Confirm no secret is bundled client-side.
- Verify `/api/collect` rejects an unauthenticated request **against production**.

### 2.7 Runbook

A short `docs/runbook.md` — or a section in the README — answering: how do I know the pipeline
is healthy; what do I do when the health endpoint goes red; how do I re-run a missed hour; how
do I restore the database; which env vars matter. Written for the person who finds it broken
six months from now, which is the same person who wrote it and will not remember.

---

## 3. Impact and Risk Analysis

**System Dependencies:** `/api/collect`, the snapshots table, GitHub Actions, Vercel, Neon.

| Risk | Mitigation |
|---|---|
| **The health endpoint keeps Neon awake and burns compute** | It is a single indexed read; measure CU-h against the 100/month budget and set the external check interval accordingly |
| **Fixing a freshness display changes behaviour users rely on** | Showing true staleness *is* the intended behaviour change. Ensure the stale state is designed, not an error state |
| **A restore test damages production** | Restore into a throwaway Neon branch, never into the primary |
| **The env audit removes a variable still in use** | Grep for each name across `src/`, `scripts/` and the workflow files before removing |
| **Verification passes once and rots** | The health endpoint is the durable part; the manual checks are recorded with dates in the runbook so staleness is visible |

---

## 4. Testing Strategy

- **Health endpoint:** unit tests over the staleness computation — fresh, exactly at
  threshold, well past it, and no snapshots at all. Integration test that it returns non-OK
  when the newest snapshot is stale.
- **Idempotency:** insert the same hour twice via both schedulers; assert one row.
- **Freshness:** a component test asserting a displayed age comes from a fixed data timestamp
  and does not move when the clock does.
- **Auth:** `/api/collect` without and with a bad `CRON_SECRET` returns 401 in production.
- **Manual, recorded with dates in the runbook:** the 24-hour completeness check, the Actions
  drift observation, the restore drill, and the client-bundle secret scan.
