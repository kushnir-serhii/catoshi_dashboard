# Functional Specification: Operator Workflows on GitHub Actions

- **Roadmap Item:** Phase 3 → An Honest Product → **Trustworthy Collection** (unblocks Phase 5 → Historical Analogs)
- **Status:** Approved
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

Three pieces of work are blocked. None of them is blocked by missing code.

| Blocked item | What is missing |
|---|---|
| Spec 013, Slice 5 | The full BTC/ETH/SOL backfill run, and the marker-integrity SQL check after it |
| Spec 012, Slice 0 (the Gate) | A real-data run of `src/scripts/analog-falsification.ts`, including its power analysis |
| Spec 017, Slice 1 | Verification queries against the live database |

Every one of those is written, type-checks, and has tests. What stops them is **network
reach**. Measured 03.09.2026 from both execution environments available to a coding agent
on this project:

```
fapi.binance.com:443     connect rejected (egress policy)
api.alternative.me:443   connect rejected (egress policy)
ep-…-pooler…neon.tech:5432   name resolution / connect blocked
api.github.com:443       200 OK
```

So the work is not "operator-only" by preference. It is operator-only because the only
machine that can reach Binance and Neon at the same time is a laptop that has to be awake,
unlocked, and babysat for half an hour — and whose console output then has to be pasted
back into a chat by hand before anyone can act on it.

**GitHub Actions is the machine that can already do all of it.** Its runners have
unrestricted egress, the repository already holds `DATABASE_URL_UNPOOLED` as a secret
(`backup.yml` uses it weekly), and two workflows already run there. Nothing new needs to be
provisioned — only triggered.

This spec moves every network-bound maintenance run onto manually-triggered Actions
workflows, so that the run is reproducible, its output is durable, and neither an operator
nor an agent needs a local environment to start one or to read the result.

**Success looks like:** an operator (or an agent with `gh` access) starts a run from the
Actions tab, walks away, and comes back to a job summary that answers the question the run
was for — *how many rows, over what date range, with what effective sample size*, or
*did marker integrity hold*, or *what is the Gate verdict* — without downloading anything
and without a database client.

**What this is not:** a replacement for the hourly collector, and not an excuse to run
anything on a schedule. Every workflow in this spec is triggered by a human decision.

---

## 2. Functional Requirements (The "What")

### 2.1 The backfill runs on demand, from the browser

- **Acceptance Criteria:**
  - [ ] A `workflow_dispatch` workflow runs `src/scripts/backfill.ts` against the production
        database, with no local checkout and no local `.env.local`.
  - [ ] Inputs cover every argument the script already accepts: which asset, `--from`,
        `--to`, and `--dry-run`. No new script arguments are invented for this spec.
  - [ ] The asset input accepts one of `BTC`, `ETH`, `SOL`, or `ALL`. `ALL` runs the three
        assets **sequentially**, never concurrently — the script holds an asset's full 15m
        history in memory and states that one asset per invocation is the limit
        (spec 013 technical-considerations §2.4).
  - [ ] A run that takes 45 minutes completes. It is not killed by a default timeout.

### 2.2 Nothing is written by accident

- **Acceptance Criteria:**
  - [ ] `dry_run` defaults to **true**. Pressing "Run workflow" with every field left alone
        assembles and reports, and writes nothing.
  - [ ] A writing run states in its first log line that it is a writing run, which asset, and
        which date bounds — so a misread input is visible in the first ten seconds and not
        after thirty minutes.
  - [ ] Re-running the same range twice is harmless. This is a property of the existing
        conflict predicate (`upsertSnapshots` never overwrites a live row), and the workflow
        must not defeat it by, for example, deleting rows first.
  - [ ] Two write-capable runs cannot overlap. A second run queues behind the first rather
        than executing beside it.

### 2.3 Marker integrity is verified by the same system that wrote the rows

The three checks are already written down in spec 013's `tasks.md`. Today they are a
sentence asking a human to open a SQL client. They become a job.

- **Acceptance Criteria:**
  - [ ] A workflow runs all three checks against the live database:
        1. `COUNT(*)` of rows carrying the backfill marker equals the total the backfill run
           reported.
        2. **No** row carries the marker together with a non-null `funding_rate`.
        3. Back-filling a timestamp that already holds a live row leaves the live values
           intact.
  - [ ] Each check reports **PASS** or **FAIL** by name. A failure fails the job — a red run,
        not a green run with a warning buried in the log.
  - [ ] The expected total for check 1 is supplied as an input, so the check compares against
        what the backfill actually reported rather than against itself.
  - [ ] The checks are read-only apart from check 3's own fixture, which must clean up after
        itself and must not touch any real timestamp.

### 2.4 The analog Gate runs on demand and produces an archivable verdict

- **Acceptance Criteria:**
  - [ ] A `workflow_dispatch` workflow runs `src/scripts/analog-falsification.ts` with its
        `--assets` and `--perms` arguments exposed as inputs.
  - [ ] The power analysis runs. A run that reports no signal without a power curve does not
        constitute a verdict (spec 012, `tasks.md` Slice 0) and the workflow must not present
        one as if it did.
  - [ ] The script's candle cache (`.cache/analogs/`) survives between runs, so the second
        run is minutes rather than the first run's 5–10.
  - [ ] The full output — the three statistics against the permutation null, the Bonferroni
        family correction, and the power curves — is retained as an artifact after the log
        expires.
  - [ ] The workflow touches no database. This is already true of the script; the workflow
        must not be given a database secret it does not need.

### 2.5 A result is readable without downloading anything

- **Acceptance Criteria:**
  - [ ] Every workflow in this spec writes its headline result to the run's job summary: the
        coverage report for a backfill, PASS/FAIL per check for the verification, the verdict
        line and the power-curve summary for the Gate.
  - [ ] The summary is enough to decide the next step. Opening the raw log is for diagnosing
        a failure, not for reading a result.

### 2.6 Secrets stay out of logs and artifacts

- **Acceptance Criteria:**
  - [ ] No connection string, bearer token or API key is echoed, printed on failure, or
        written into an artifact — including in `psql` error output, which quotes the
        connection it failed on.
  - [ ] A failing step fails loudly without dumping its environment.

### 2.7 The runs are documented where an operator will look

- **Acceptance Criteria:**
  - [ ] `docs/runbook.md` gains a section naming each workflow, what it is for, what to pass,
        and how to read its summary.
  - [ ] The pending items in spec 013's, 012's and 017's `tasks.md` that said "operator" now
        name the workflow that does the job instead.

---

## 3. Scope and Boundaries

### In-Scope

- Manually-triggered (`workflow_dispatch`) workflows for: the market-history backfill, the
  post-backfill marker-integrity check, and the analog falsification Gate.
- Job summaries and retained artifacts for each.
- Runbook documentation for all three.
- Whatever minimal change `package.json` needs so the same scripts run without
  `--env-file=.env.local`, which does not exist on a runner.

### Out-of-Scope

- **Any change to what the scripts compute.** `backfill.ts` and `analog-falsification.ts`
  are treated as finished. If a run reveals a defect, that is a finding for their own spec,
  not a fix inside this one.
- **Scheduling.** No `schedule:` trigger is added by this spec. `collect.yml` remains the
  only scheduled data-writing workflow.
- **The Gate verdict itself.** This spec delivers the means to run the Gate. Recording the
  verdict, and deciding whether spec 012 proceeds, belongs to spec 012 Slice 0.
- **Production deployment, Vercel configuration and Actions secrets for `/api/collect`.**
  That is spec 017. The two are independent: the workflows here talk to Neon and Binance
  directly and do not need the app deployed.
- **Database migrations.** `scripts/migrate.mjs` stays an operator action.
