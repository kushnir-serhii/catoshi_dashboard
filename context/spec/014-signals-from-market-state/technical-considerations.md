# Technical Considerations: Signals From Market State

- **Status:** Completed

Companion to `functional-spec.md`. Records the decisions, the traps found while reading
the existing code, and the reasoning behind the shape of the rule layer.

---

## 1. What Is Already There, and What Is Broken

Reading the current implementation end to end turned up more than the missing table.

**1.1. The `signals` table does not exist.** `src/app/api/signals/route.ts` runs
`select * from signals order by published_at desc limit $1`. No migration creates it.
The query throws, the handler catches, logs, and returns `fetchError: true` with an empty
array. The route handler is not at fault — it is the only honest part of the chain.

**1.2. Nothing produces signals.** There is no writer, no collector, no rule layer.
`CLAUDE_SIGNALS_MODEL` sits in `src/consts/signals.ts` unused — a leftover pointing at
the spec 002 design that was never built.

**1.3. `revalidate = 21600` fights the collection cadence.** The route caches for six
hours. Collection runs hourly. Even once signals exist, a new one would be invisible for
up to six hours, while `SIGNALS_REFRESH_INTERVAL_MS = 60_000` has the client politely
re-fetching a cached response every minute. The 6-hour figure is a fossil of spec 002's
6-hour news cycle. **This route must not be statically cached at all** — set
`dynamic = 'force-dynamic'` (or `revalidate = 0`) and let the client poll.

**1.4. `nextUpdate` is fabricated.** The handler returns `Date.now() + 6h` regardless of
when collection actually last ran or will run next. The UI renders it as fact. It should
be derived from the newest snapshot's `ts` plus the collection interval, or omitted.

**1.5. `lastUpdated` is `new Date()`.** It reports when the *request* happened, not when
the data was produced — so the page always looks freshly updated even when collection
died three days ago. This is the same class of dishonesty as the old mock fallback, in a
quieter form. It must come from the newest snapshot backing the returned signals.

**1.6. `SIGNALS_COUNT = 6` is unused.** The route hardcodes `limit 20`. Either the
constant governs the limit or it should go — the constants rule in `CLAUDE.md` says a
value used in two places lives in `src/consts/`, and this one is used in none.

**1.7. The UI drops `fetchError` on the floor.** `useSignals` returns it; `SignalsPage`
destructures `isStale` and ignores `fetchError`. A dead feed renders as an empty grid
with no explanation.

**1.8. `TRACKED_COINS` over-promises.** It lists LINK, ARB and TAO alongside BTC, ETH and
SOL. `COLLECT_ASSETS` covers three. Signals can only ever mention what is collected.

---

## 2. Data Model

Matching the house style of `db/migrations/0001_analytics.sql`: `public.` prefix,
identity columns rather than `serial`, named constraints.

```sql
create table if not exists public.signals (
    id              bigint      generated always as identity primary key,
    asset_id        bigint      not null references public.assets (id) on delete cascade,
    rule_id         text        not null,
    snapshot_ts     timestamptz not null,
    since_ts        timestamptz not null,
    tag             text        not null check (tag in ('BULLISH','BEARISH','NEUTRAL')),
    title           text        not null,
    body            text        not null,
    source          text        not null,
    severity        real        not null check (severity >= 0 and severity <= 1),
    created_at      timestamptz not null default now(),

    constraint signals_asset_rule_ts_key unique (asset_id, rule_id, snapshot_ts)
);

create index if not exists signals_recent_idx
    on public.signals (snapshot_ts desc, severity desc);
```

`asset_id` is **`bigint`**, not `int`: `public.assets.id` is
`bigint generated always as identity`. An `int` foreign key would still work today and
break silently at scale — worth getting right in the migration rather than in a fix.

**Why a row per hour rather than a row per condition.** Storing one row each time a rule
fires keeps the writer a plain idempotent upsert with no state machine, and preserves the
full record of when each condition held — useful later, and cheap now (three assets ×
a handful of rules × 24 hours is a few thousand rows a month).

**Why `since_ts` exists.** Requirement 2.3 says a condition holding for twenty hours must
not produce twenty cards. Collapsing at read time solves the card count; `since_ts`
solves the more useful half — the user wants "overbought since 14:00", not "overbought,
noticed again a minute ago". On write, if a row exists for the same `(asset_id, rule_id)`
at the previous collection hour, its `since_ts` carries forward; otherwise `since_ts`
equals `snapshot_ts`. One indexed lookup per rule per asset per run.

**Why `severity` is stored, not computed on read.** Ordering must be stable between
requests, and the rule is the only thing that knows how far past its threshold the
reading sits.

**Provenance.** `(asset_id, rule_id, snapshot_ts)` is enough to reconstruct any signal
from the `snapshots` row that produced it. That is what makes requirement 2.1 checkable
rather than a matter of trust.

---

## 3. Read Path

```sql
select distinct on (asset_id, rule_id) *
  from signals
 where snapshot_ts > now() - interval '3 hours'
 order by asset_id, rule_id, snapshot_ts desc
```

…then order the collapsed set by `severity desc, snapshot_ts desc` and take
`SIGNALS_COUNT`.

**Freshness window of 3 hours.** Collection is hourly and GitHub Actions schedules are
best-effort (spec 010, §6) — a one-hour window would blank the page on a routine delay.
Three hours tolerates two missed runs while keeping "current" honest. It belongs in
`src/consts/signals.ts`.

**Distinguishing empty from broken (requirement 2.4).** Zero rows is ambiguous on its
own: no rule fired, or collection is dead. The API resolves it by also reading the newest
`snapshots.ts`. Recent snapshot + no signals = genuinely quiet. Stale or absent snapshot
= the feed is broken, regardless of what the `signals` table holds. This needs a third
field on `SignalsResponse` alongside `fetchError` — the response currently cannot express
"working, nothing to say".

---

## 4. Rule Layer

Rules live in `src/lib/signals/rules/`, one file per rule, each exporting a pure
`(snapshot: MarketSnapshot, previous: MarketSnapshot | null) => Signal | null`.

**Why pure functions over a config-driven threshold table.** A table of
`{field, operator, value}` looks tidier and collapses the moment a rule needs two fields,
a previous snapshot, or prose that embeds a computed number. Rules are code.

**Null discipline.** Every numeric field on `MarketSnapshot` is nullable by design —
spec 010 §2.6 made a failed source null rather than failing the snapshot. A rule whose
inputs are null returns `null`. It must never treat a missing funding rate as zero: that
is exactly how "funding flipped negative" gets announced because Binance timed out.
This is requirement 2.6's third case and the single most likely bug in the whole spec.

**Starting rule set.** Chosen because each maps to a field that already exists and states
something a person would actually want told:

| `rule_id` | Fires when | Tag |
|---|---|---|
| `rsi_1d_overbought` | daily RSI ≥ 70 | Bearish |
| `rsi_1d_oversold` | daily RSI ≤ 30 | Bullish |
| `rsi_divergence_4h_1d` | 4h and daily RSI on opposite sides of 50 | Neutral |
| `funding_flip` | funding rate changes sign vs previous snapshot | by direction |
| `funding_extreme` | \|funding\| above threshold | contrarian to crowd |
| `oi_surge` | OI up sharply over 24h with price roughly flat | Neutral |
| `etf_streak` | ETF net flow same sign ≥ 5 consecutive days | by direction |
| `volume_spike` | daily volume z-score ≥ 2 | Neutral |
| `ma_compression` | MA7 and MA25 within a small % of each other | Neutral |
| `fear_greed_extreme` | index ≤ 20 or ≥ 80 | contrarian |

`ma_compression` is deliberately included: the forecast journal's miss #4 turned on MA7 /
MA25 compression on the **4h** timeframe, and `snapshotBuilder` now stores per-timeframe
MAs (AC 2.4), so the rule can read the timeframe that actually mattered.

Every threshold goes in `src/consts/signals.ts`. None inline.

**Severity.** Normalised distance past the threshold, clamped to 0..1 — RSI 85 outranks
RSI 71. Rules with no natural scale return a fixed mid value. Crude on purpose: this is
card ordering, not a model.

---

## 5. Write Path

Signal generation hangs off the existing `/api/collect` run, after snapshots are written,
inside the same request. It is not a separate schedule.

**Why not a separate cron.** A second schedule can drift out of step with collection and
generate signals from snapshots that do not exist yet, or miss an hour silently. Sharing
the run makes "signals exist for hour H" follow from "the snapshot for hour H was
written".

**Failure isolation.** A throwing rule must not fail the collection run — snapshot data
is unrecoverable if lost (spec 010, §1: derivatives history does not backfill), signals
are trivially regenerable. Each rule is called inside a try/catch; a failure is logged
and reported through the existing `SourceStatus` mechanism.

**Ordering.** Snapshots commit first. A signal referencing an uncommitted snapshot would
violate its own provenance guarantee.

---

## 6. Types

`SignalItem` in `src/data/types.ts` gains `since` (ISO string) and keeps everything else.
The API maps `since_ts` to it. `SignalsResponse` gains a field distinguishing "no signals,
system healthy" from `fetchError`.

`SignalRow` in the route handler currently declares `id: string`; the column is an
identity `bigint`, which `pg` returns as a string by default. Either the interface stays
`string` deliberately and says so, or the query casts. Left as-is, it is
a silent lie the type checker cannot catch, because `select *` is typed by assertion.

**While here:** replace `select *` with an explicit column list. `select *` plus a
hand-written row interface is how a renamed column becomes a runtime `undefined` instead
of a compile error.

---

## 7. Testing

**A test suite is out of scope for this implementation by request.** Rules are still
written as pure `(snapshot, previous) => Signal | null` functions with no I/O, so they
remain hand-testable with a `tsx` script later (the `src/scripts/analog-core.test.ts`
pattern) if that decision is revisited.

What still must hold without a suite: the boundary behaviour (`>= 70` vs `> 70` on
exactly the reading most likely to occur) is pinned by the threshold constants and code
review, and the null case (requirement 2.6) is enforced in every rule — a rule whose
inputs are null returns `null`, never a signal built on `0` or `50`.

---

## 8. Risks

**8.1. Signals restate what the chart already shows.** "RSI is 72" is not insight. The
mitigation is in the copy: the body carries the number *and* the consequence, and rules
whose output nobody reads twice should be deleted rather than kept for card count.

**8.2. Six cards is a target, not a promise.** On a quiet day two rules fire. Requirement
2.3 forbids padding, so the page must look deliberate with two cards. This is a UI
concern the current grid has never faced.

**8.3. Three assets is thin.** Three assets × ten rules, most inactive most of the time,
may not fill the page. Widening `COLLECT_ASSETS` is the real fix and belongs to spec 010's
territory, not here.

**8.4. Thresholds are picked, not calibrated.** RSI 70 is convention, not evidence. Once
spec 011's scoring exists, these become measurable; until then they are stated defaults,
and the spec should not pretend otherwise.
