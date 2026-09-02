# Operations Runbook

Spec 017 — Collection Reliability & Deployment.

Written for the person who finds the pipeline broken six months from now — the
same person who wrote it and will not remember. Everything downstream (signals,
scoring, backfill, analogs) reads rows the hourly collector writes; if collection
stops, those features degrade **silently**, which has happened twice before
(`context/product/decisions.md` §3).

---

## 1. Is the pipeline healthy?

### The ten-second check: `GET /api/health`

```
curl -s https://<production-host>/api/health | jq
```

- **HTTP 200** — newest snapshot across all tracked assets is within
  `SNAPSHOT_STALE_MINUTES` (`src/consts/collect.ts`, currently **90 min**).
- **HTTP 503** — newest snapshot is older than the threshold, or there are no
  snapshots at all. This is the signal a free external uptime checker
  (UptimeRobot, Better Stack, healthchecks.io, etc.) should watch. Point one at
  this URL; that is the entire alerting layer in this version.

Response shape (counts and timestamps only — no connection string, credential or
raw row, and it makes no external API call):

```jsonc
{
  "ok": true,
  "checkedAt": "2026-09-02T12:00:00.000Z",
  "staleThresholdMinutes": 90,
  "newestSnapshotTs": "2026-09-02T11:00:00.000Z",
  "newestSnapshotAgeMinutes": 60,
  "assets": [
    {
      "symbol": "BTC",
      "newestSnapshotTs": "...",
      "ageMinutes": 60,
      "snapshots24h": 24,
      "stale": false,
    },
    {
      "symbol": "ETH",
      "newestSnapshotTs": "...",
      "ageMinutes": 60,
      "snapshots24h": 24,
      "stale": false,
    },
    {
      "symbol": "SOL",
      "newestSnapshotTs": "...",
      "ageMinutes": 60,
      "snapshots24h": 24,
      "stale": false,
    },
  ],
  "collectors": [
    { "source": "BTC:funding", "lastSuccessAt": "...", "lastAttemptAt": "...", "lastError": null },
  ],
}
```

`collectors` is read from `public.collector_status`, upserted once per source
after every `/api/collect` run (migration `0007_collector_status.sql`). Because
each source has its own `last_success_at`, **one feed failing for six hours is
distinguishable from the whole run failing once** — the failing source's
`last_success_at` falls behind its peers while theirs keep advancing.

### The 24-hour completeness query

`/api/health` reports `snapshots24h` per asset (expected: 24). To see exactly
which hours are missing, run against the database directly:

```sql
-- Missing hourly snapshots in the last 24h, per asset.
with hours as (
  select generate_series(
    date_trunc('hour', now()) - interval '23 hours',
    date_trunc('hour', now()),
    interval '1 hour'
  ) as ts
)
select a.symbol, h.ts as missing_hour
from hours h
cross join public.assets a
left join public.snapshots s
  on s.asset_id = a.id and s.ts = h.ts
where s.id is null
order by a.symbol, h.ts;
```

An empty result means the last 24 hours are complete. Investigate and record the
cause of **every** missing hour — do not average them away.

```sql
-- Snapshot count and newest ts per asset (quick sanity read).
select a.symbol,
       count(s.id) as total,
       max(s.ts)   as newest,
       count(s.id) filter (where s.ts > now() - interval '24 hours') as last_24h
from public.assets a
left join public.snapshots s on s.asset_id = a.id
group by a.symbol
order by a.symbol;
```

### Server-side hour truncation

The GitHub Actions schedule is best-effort and drifts by minutes. That drift must
not create two rows for the same hour under different `ts`. `src/app/api/collect/route.ts`
truncates server-side — `const hourTs = truncateToHour(new Date())` (line 79),
and `truncateToHour` floors to the top of the hour via `setUTCMinutes(0, 0, 0)`.
The timestamp is **never** taken from the firing moment, and never from a
client-supplied value. `public.snapshots` has `UNIQUE (asset_id, ts)` and the
write is an upsert, so the hourly run and the daily `vercel.json` fallback
running in the same hour produce **one** row, not two.

---

## 2. Health went red — what to do

1. **Read `/api/health`.** Which assets are `stale`? Is it all of them (whole
   pipeline) or a subset (one asset's feed)?
2. **Check `collectors[]`.** A single `source` with an old `last_success_at` and
   a non-null `last_error` while the others are current = one upstream feed is
   down (Binance, CoinGecko, Farside ETF flows). Often transient; confirm it
   recovers on the next hourly run before digging further.
3. **Check the GitHub Actions run history** for `collect.yml` (repo → Actions →
   "Hourly market collection"). Confirm it is still firing hourly and record the
   observed drift. If it shows as **disabled**, GitHub has paused it after 60
   days without repository activity — any commit re-enables it (see §5).
4. **Check the Vercel deployment.** If the production deployment is down or the
   `COLLECT_ENDPOINT` / `CRON_SECRET` secrets are wrong, `collect.yml` fails
   every run. `curl -s -o /dev/null -w '%{http_code}' https://<host>/api/health`
   should be reachable.
5. **Re-run the missed hours** once the cause is fixed — see §3.

---

## 3. Re-run a missed hour

`collect.yml` has a `workflow_dispatch` trigger. Trigger it manually:

- GitHub UI: Actions → "Hourly market collection" → **Run workflow**.
- CLI: `gh workflow run collect.yml`

Each run collects the **current** hour (server-truncated). There is no
backfill-a-specific-past-hour path for market snapshots — a missed hour of
derivatives data (funding, open interest, long/short) is **not recoverable**,
which is the whole reason this spec exists. Price history alone backfills via
spec 013; the derivative dimensions do not.

The run is idempotent: if the hour already has rows, the upsert refreshes them
rather than duplicating.

---

## 4. Restore the database

Neon's free plan gives **no automatic backups** and only a 6-hour instant-restore
window (`decisions.md` §2). `.github/workflows/backup.yml` takes an independent
weekly logical dump.

- **Schedule:** weekly, `cron: '0 3 * * 0'` (Sundays 03:00 UTC), plus
  `workflow_dispatch`.
- **Format:** `pg_dump --format=custom` → `snapshot.dump`.
- **Storage:** GitHub Actions artifact named `catoshi-db-backup-<run_id>`.
- **Retention:** 90 days (`retention-days: 90` in the workflow).
- **Connection:** `DATABASE_URL_UNPOOLED` (direct/unpooled — `pg_dump` holds one
  long session and issues catalog queries the pooler's transaction mode
  mishandles).

### Restore drill (into a throwaway Neon branch — never the primary)

```bash
# 1. Download the newest dump artifact.
gh run download --name catoshi-db-backup-<run_id> --dir ./restore

# 2. Create a throwaway Neon branch (copy-on-write, free) from the Neon
#    dashboard or CLI, and copy its DIRECT connection string.
#    neonctl branches create --name restore-drill-YYYYMMDD

# 3. Restore into that branch. --clean --if-exists makes it idempotent;
#    --no-owner / --no-privileges avoid role mismatches on a fresh branch.
pg_restore \
  --dbname "postgresql://<restore-branch-direct-url>" \
  --clean --if-exists --no-owner --no-privileges \
  ./restore/snapshot.dump

# 4. Verify.
psql "postgresql://<restore-branch-direct-url>" -c "
  select 'snapshots' as t, count(*), max(ts) from public.snapshots
  union all select 'forecasts', count(*), max(created_at) from public.forecasts
  union all select 'signals', count(*), max(created_at) from public.signals;
"

# 5. Delete the throwaway branch when done.
```

**A backup that has never been restored is not a backup.** Record each drill in
§7 with the date and the row counts observed.

---

## 5. The 60-day inactivity rule

GitHub **disables scheduled workflows after 60 days without repository activity.**
A commit to any branch resets the counter. If both `collect.yml` and
`backup.yml` show as disabled in the Actions tab, this is why — not a code bug.
Push any commit and re-enable them.

This compounds with Neon: a long-enough quiet stretch would stop collection
(GitHub) and, on some providers, pause the database too. Neon's compute sleeps
and wakes itself in ~0.5 s, so the database side is fine — but the scheduler is
not self-healing.

---

## 6. Environment variables that matter

| Variable                    | Where                               | Purpose                                                                                                                                                  |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Vercel (app runtime)                | **Pooled** Neon connection (host contains `-pooler`). Every serverless DB read.                                                                          |
| `DATABASE_URL_UNPOOLED`     | `.env.local`, GitHub Actions secret | **Direct** Neon connection. `scripts/migrate.mjs` (DDL) and `backup.yml` (`pg_dump`). Confirmed: both use this, not the pooled URL.                      |
| `CRON_SECRET`               | Vercel env + GitHub Actions secret  | Shared bearer token authenticating `/api/collect`. Vercel also auto-injects it on its own native cron calls. Compared with `crypto.timingSafeEqual`.     |
| `COLLECT_ENDPOINT`          | GitHub Actions secret **only**      | Deployed URL `collect.yml` POSTs to, e.g. `https://<host>/api/collect`. The app never reads this — it is the caller's address. Not in `.env`.            |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Vercel env                          | Must be **`false`** in production. When `true`, routes (`/api/signals`, `/api/projections`, `/api/health`) return synthetic data and never touch the DB. |

Migrations: `node --env-file=.env.local scripts/migrate.mjs` (all pending) or
`... scripts/migrate.mjs 0007` (one file by prefix). Runs each file in one
transaction and records it in `schema_migrations`, so re-running is safe.

---

## 7. Manual checks (dated — staleness is meant to be visible)

### 2026-09-02

| Check                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Current pipeline state**                                        | The live DB has only **3 distinct snapshot hours total** (2026-09-01 16:00 & 21:00, 2026-09-02 08:00), newest ~12 h old. Hourly collection is **NOT currently running on schedule** — almost certainly because the GitHub Actions `COLLECT_ENDPOINT` / `CRON_SECRET` secrets and/or the Vercel production deployment are not yet configured. The observability layer (this runbook, `/api/health`, `collector_status`, the freshness note) is shipped; proving the pipeline runs is pending the deployment/secrets work. |
| `scripts/migrate.mjs` uses `DATABASE_URL_UNPOOLED`                | ✅ Confirmed (falls back to pooled with a printed warning if unset).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `.github/workflows/backup.yml` uses `DATABASE_URL_UNPOOLED`       | ✅ Confirmed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Server-side hour truncation                                       | ✅ Confirmed at `src/app/api/collect/route.ts:79`; `truncateToHour` floors via `setUTCMinutes(0, 0, 0)`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Migration `0007_collector_status.sql`                             | ✅ Applied and verified (`public.collector_status`: `source` PK, `last_success_at`, `last_attempt_at`, `last_error`, `updated_at`).                                                                                                                                                                                                                                                                                                                                                                                      |
| GitHub Actions schedule drift observation                         | **PENDING — operator** (needs deployment + run history).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/api/collect` rejects unauthenticated request against production | **PENDING — operator**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Client-bundle secret scan                                         | **PENDING — operator**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Weekly `pg_dump` produces a non-empty, restorable dump            | **PENDING — operator**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Restore drill into a throwaway Neon branch                        | **PENDING — operator**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/health` CU-h cost measured against the 100/month budget     | **PENDING — operator** (set the external check interval from the measurement).                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## 8. Design note — why `collector_status` is a table

Slice 3 needed last-success-per-source persisted across runs. Options were a
dedicated table keyed by `source`, or a jsonb blob on a settings row. Chose the
**table**: the requirement — "one source down for six hours is distinguishable
from the whole run failing once" — is a per-source `last_success_at` that
diverges from its peers, which a row-per-source models directly; `/api/health`
reads it with a plain indexed `select` and no jsonb extraction; and there is no
existing settings table to hang a jsonb row off. See
`db/migrations/0007_collector_status.sql`.
