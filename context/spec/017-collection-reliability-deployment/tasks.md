# Tasks: Collection Reliability & Deployment

Mostly verification. The clock matters: derivatives history is not backfillable, so every
week collection is unproven is a week lost permanently. Slice 1 is the urgent one.

---

## Slice 1 — Prove collection runs

- [ ] Query a full 24-hour window: 24 hourly snapshots per tracked asset, no gaps.
- [ ] Investigate and record the cause of **every** missing hour. Do not average them away.
- [ ] Read the `collect.yml` Actions run history; record the observed schedule drift.
- [ ] Verify the snapshot timestamp is truncated to the hour **on the server**, not taken from the firing moment — drift must not produce the same hour twice under different `ts`.
- [ ] Verify the daily `vercel.json` fallback fires and is idempotent against the hourly run: both in one hour produce one row.
- [ ] Add the 60-day inactivity note to the README — GitHub disables scheduled workflows after 60 days without repo activity; a commit resets it.

**Done when:** you can state, with evidence, that the last 24 hours are complete.

---

## Slice 2 — Make freshness true

- [ ] Grep `new Date()` and `Date.now()` across every component and route that renders an age or "last updated". Each hit is justified in a comment or replaced with a timestamp read from the data. Cover `SignalsPage`, `MarketsPage`, `ProjectionsPage`, `ForecastContextPanel`, and `src/hooks/`.
- [ ] Add `SNAPSHOT_STALE_MINUTES` to `src/consts/collect.ts`. One threshold, shared by the UI warning and the health endpoint — two will diverge.
- [ ] When the newest snapshot is past the threshold, the surface says so plainly. Design the stale state; do not render it as an error.
- [ ] Component test: a displayed age derives from a fixed data timestamp and does not move when the clock does.

---

## Slice 3 — Persist per-source status

- [ ] Persist last-success-per-source across runs — a small `collector_status` table or a jsonb settings row. Pick one, write down which.
- [ ] Requirement: a single source failing for six hours is distinguishable from the whole run failing once.
- [ ] Wire it from the existing `SourceStatus` tracking in `/api/collect`.

---

## Slice 4 — Health endpoint

- [ ] `GET /api/health`, read-only, unauthenticated. Per asset: newest snapshot `ts`, its age, snapshots in the last 24 h, and per-collector last-success times.
- [ ] Non-OK HTTP status when the newest snapshot is older than `SNAPSHOT_STALE_MINUTES`, so a free external uptime checker can watch one URL — that is the entire alerting story in this version.
- [ ] Exposes no connection string, credential or raw row. Makes no external API call.
- [ ] Measure its CU-h cost against the 100/month Neon budget and set the external check interval from that.
- [ ] Tests: fresh / exactly at threshold / well past / no snapshots at all.

---

## Slice 5 — Backups you have actually restored

- [ ] Confirm `backup.yml` runs weekly and produces a non-empty dump. Record where it is stored and for how long.
- [ ] **Perform one real restore** into a throwaway Neon branch. A backup that has never been restored is not a backup, and the free plan gives no automatic backups and a 6-hour restore window (`decisions.md` §2).
- [ ] Write the restore procedure down.
- [ ] Confirm `scripts/migrate.mjs` uses `DATABASE_URL_UNPOOLED` and the app uses the pooled `DATABASE_URL`.

---

## Slice 6 — Deployment audit

- [ ] Reconcile `.env.example`, `.env.local` and Vercel production. Every used variable listed; every listed variable still used. Grep each name across `src/`, `scripts/` and `.github/workflows/` before removing.
- [ ] Remove stale entries — `CRYPTOPANIC_API_KEY` is a known one; no code path calls that API.
- [ ] `NEXT_PUBLIC_USE_MOCK_DATA=false` in production. Inspect every route and confirm none falls back to mock data on an upstream error — this is the original defect (`decisions.md` §3, instance 1) and the check lives here permanently.
- [ ] Scan the client bundle: no secret present, only `NEXT_PUBLIC_*` reaches the browser.
- [ ] Verify `/api/collect` rejects a request with no `CRON_SECRET` and with a bad one — **against production**, not only locally.
- [ ] Confirm the production deployment serves the dashboard.

---

## Slice 7 — Runbook

- [ ] `docs/runbook.md` (or a README section): how to tell the pipeline is healthy; what to do when health goes red; how to re-run a missed hour; how to restore the database; which env vars matter.
- [ ] Record the manual checks from slices 1, 5 and 6 **with dates**, so their staleness is visible later.
- [ ] Tick the Phase 3 → Trustworthy Collection checkboxes in the roadmap; update `README.md` §3.

---

## Deliberately not in any slice

- Paid monitoring or alerting services. A pollable health endpoint is the whole story here.
- Email or push notifications.
- Multi-region or high-availability deployment.
- Automatic recovery. The goal is that a human finds out quickly.
- Collecting liquidations — WebSocket-only data needing an always-on process, which Vercel is not.
