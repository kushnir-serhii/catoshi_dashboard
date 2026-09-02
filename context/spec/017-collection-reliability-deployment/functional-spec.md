# Functional Specification: Collection Reliability & Deployment

- **Roadmap Item:** Phase 3 → An Honest Product → **Trustworthy Collection**
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Everything downstream of this spec — signals, scoring, backfill, analogs — reads rows that
the hourly collector writes. If the collector stops, every one of those features degrades,
and the project's history shows exactly how it degrades: **silently**. A stalled pipeline has
twice looked healthy from the outside (`decisions.md` §3).

The machinery already exists. `.github/workflows/collect.yml` calls `/api/collect` hourly,
`.github/workflows/backup.yml` exists, `vercel.json` holds the daily fallback cron. What does
not exist is **evidence that any of it runs**, and a way for the product to say so when it
does not.

There is also a clock running. Derivatives history — open interest, long/short ratio,
liquidations — is not backfillable: Binance retains about 30 days of `openInterestHist` and
long/short, and liquidations exist only in real time. **Every week collection is unproven is
a week of history that cannot be recovered.** Price history backfills (spec 013); this does
not.

**Success looks like:** an operator can answer "is the pipeline healthy?" in under ten
seconds without opening a database client, and a visitor to the dashboard can see the true
age of the data in front of them.

---

## 2. Functional Requirements (The "What")

### 2.1 Collection is proven, not assumed

- **Acceptance Criteria:**
  - [ ] A documented check confirms rows land for every tracked asset for a full 24-hour
        window: 24 hourly snapshots per asset, no gaps.
  - [ ] Any hour missing from that window is investigated and the cause recorded — not
        averaged away.
  - [ ] The GitHub Actions run history is read directly to confirm the schedule fires, and the
        observed drift is recorded. The schedule is best-effort and drifts by minutes; the
        snapshot timestamp is truncated to the hour **on the server**, so drift must not
        produce duplicate hours under different `ts` (`decisions.md` §4).
  - [ ] The daily `vercel.json` fallback is confirmed to fire and to be idempotent against the
        hourly run.
  - [ ] The 60-day inactivity rule is documented in the README: GitHub disables scheduled
        workflows after 60 days without repository activity, and a commit resets the counter.

### 2.2 Freshness is true everywhere it is shown

- **Acceptance Criteria:**
  - [ ] Every surface displaying a "last updated" or age reads it from the **data**, never
        from `new Date()` at render time. This is a regression check on a defect that already
        shipped once.
  - [ ] When the newest snapshot is older than a configured threshold, the surface says so
        plainly rather than presenting stale data as current.
  - [ ] A per-source status is exposed: which collectors succeeded and which failed in the
        most recent run, and when each last succeeded. A single collector failing must be
        distinguishable from the whole run failing.

### 2.3 A stalled pipeline is visible

- **Acceptance Criteria:**
  - [ ] A health endpoint reports, for each tracked asset: newest snapshot timestamp, its age,
        the count of snapshots in the last 24 hours, and per-collector last-success times.
  - [ ] It returns a non-OK status when the newest snapshot is older than the threshold, so an
        external uptime check can watch one URL.
  - [ ] It requires no secret to read and exposes no credential, connection string or raw
        row — only counts and timestamps.

### 2.4 The database survives neglect

- **Acceptance Criteria:**
  - [ ] The weekly `pg_dump` is confirmed to run and to produce a non-empty, restorable dump.
  - [ ] A restore has been performed at least once into a throwaway Neon branch, and the
        procedure is written down. **A backup that has never been restored is not a backup**,
        and the Neon free plan gives no automatic backups and only a 6-hour restore window
        (`decisions.md` §2).
  - [ ] The dump's retention and storage location are documented.
  - [ ] Migrations are confirmed to run against `DATABASE_URL_UNPOOLED`; the application uses
        the pooled `DATABASE_URL`. Mixing them is a class of failure that appears only under
        load.

### 2.5 The application is deployed and reachable

- **Acceptance Criteria:**
  - [ ] A production deployment exists on Vercel and serves the dashboard.
  - [ ] Every required environment variable is present in production, and `.env.example`
        lists them all with no stale entries.
  - [ ] `/api/collect` rejects a request without a valid `CRON_SECRET`, and the check is
        verified against production, not only locally.
  - [ ] No secret is present in the client bundle. Only `NEXT_PUBLIC_*` variables reach the
        browser.
  - [ ] `NEXT_PUBLIC_USE_MOCK_DATA` is **false** in production, and it is verified that no
        route silently falls back to mock data when an upstream call fails.

---

## 3. Scope and Boundaries

### In-Scope

- Verifying hourly collection actually writes, and recording the evidence.
- A health/freshness endpoint and per-source status.
- Auditing every freshness display for render-time timestamps.
- Verifying the weekly dump and performing one real restore.
- Production deployment, environment variable audit, secret and mock-data checks.
- Documenting the operational runbook: what to check, and what to do when collection stops.

### Out-of-Scope

- Paid monitoring or alerting services. A health endpoint an external checker can poll is the
  whole of the alerting story in this version.
- Email or push notifications.
- Multi-region or high-availability deployment.
- Automatic recovery. The goal is that a human finds out quickly, not that the system
  self-heals.
- Collecting liquidations. Correctly deferred — WebSocket-only data needs an always-on
  process, which Vercel is not (`decisions.md` §8, defect 7).
