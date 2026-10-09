# Technical Specification: Market Pulse & Signals Coverage

- **Functional Specification:** `./functional-spec.md` (§0 explains why, §2.8 is a gate)
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

```
/api/collect (hourly, GitHub Actions)
  snapshots → market-state rules (014, extended) → scoring → news ingest/classify/publish (015, fixed)
            → macro collector (new, daily-gated) → macro rules (new)
            → pulse compute (new, pure) → public.market_pulse
            → notify (new, gated by §2.8 verdict) → Telegram
GET /api/pulse?scope=…   reads public.market_pulse only
SignalsPage              MarketPulse block on top of the existing feed
```

Every new stage is isolated and non-fatal, in the same way the spec 015 stages are. The
Pulse is computed **from stored live signals**, not from raw sources. One input path
means every driver chip maps to a card the user can open, and the Pulse can never show
evidence the feed does not.

No LLM call is added. The only LLM change is the spec 015 prompt revision (§5).

---

## 2. Pulse model (pure: `src/lib/pulse/compute.ts`)

### 2.1 Inputs

All live `public.signals` rows for the scope:
- scope `market`: every `market`-scoped row, plus asset rows at half weight;
- scope `BTC|ETH|SOL`: rows for that asset, plus `market` rows.

"Live" means the existing read definition: market-state rows inside
`SIGNALS_FRESHNESS_HOURS`, news rows before `expires_at`.

### 2.2 Contribution of one signal

```
c = sign(tag) · severity · W[category] · decay(age) · opinionFactor
```

- `sign`: BULLISH +1, BEARISH −1, NEUTRAL 0. Neutral rows still count toward
  `PULSE_MIN_INPUTS`, but they do not move the bar.
- `severity`: `LOW` 0.35, `MEDIUM` 0.65, `HIGH` 1.0 (`PULSE_SEVERITY`). With `PULSE_K = 3`
  one MEDIUM signal moves an index to about 20, and four MEDIUM signals across categories
  to about 58, which lines up with the alert threshold of 60 and means a lone signal on
  each side never reads as Conflict. A 1–3 scale would put one MEDIUM signal at 51 and
  trigger Conflict by itself. These are conventions; check them against the 10-07 fixture
  and the backtest. If stored `severity` is already numeric, map it to this scale in one
  place.
- `category`: one of `flows` (ETF), `derivatives` (funding, OI, L/S, flush/squeeze),
  `technical` (RSI, MA, range, velocity), `sentiment` (Fear & Greed), `macro`, `news`.
  It is derived from `rule_id` / `kind` in one mapping in `src/consts/pulse.ts`.
- `W`: starting weights `flows 1.2, derivatives 1.0, macro 1.0, news 0.8, technical 0.6,
  sentiment 0.5`. These are conventions (README §4 rule 2 is honoured by the disclaimer
  on the surface, functional §2.1 item 8).
- `decay`: market-state rows are 1.0 (they are re-asserted hourly). News rows use
  `exp(−age / (horizon_hours / 2))`. Macro rows use `exp(−obs_age_hours /
  MACRO_DECAY_HOURS)` (default 72), because their series arrive late (§4.2).
- `opinionFactor`: `PULSE_OPINION_WEIGHT` (default 0) for `content_type = 'opinion'`,
  otherwise 1.
- **Unclassified news:** rows with `content_type` null (classified under an older prompt
  version; the read path still falls back to them, see this spec's `decisions.md`) stay in
  the feed but are excluded from the Pulse and from `PULSE_MIN_INPUTS`. Otherwise old
  opinion columns would count at full weight.
- **Duplicates:** news rows sharing a `cluster_id` (§5.3) count once. Severity, sign and
  label come from the highest-severity member; the driver chip's `signal_id` is that
  member's id, and the collapsed card carries the same id so the chip can scroll to it.
- **Per-category cap:** per category and side, `Σ(severity · decay · opinionFactor)` is
  capped at `PULSE_CATEGORY_CAP` (default 2.0, about three HIGH signals) **before** it is
  multiplied by `W[category]`, so the weights still matter at saturation. Ten bearish news
  items must not outvote flows, derivatives and macro together.

### 2.3 Indices

```
bullRaw = Σ max(c, 0)          bearRaw = Σ max(−c, 0)
bull = round(100 · (1 − exp(−bullRaw / PULSE_K)))
bear = round(100 · (1 − exp(−bearRaw / PULSE_K)))
value = bull − bear            // −100..+100
conflict = bull ≥ PULSE_CONFLICT_MIN && bear ≥ PULSE_CONFLICT_MIN
```

The saturating form keeps each index in 0–100 without a hard clip, so the 5th bearish
signal still moves it a little. Default `PULSE_K = 3`.

### 2.4 Drivers and summary

- Drivers are the top 5 rows by `|c|`, after cluster collapse, carrying `signal_id`,
  label and display value.
- `missingCategories` lists categories whose collector status is failing (from
  `public.collector_status`). This is functional §2.2's "Without: macro" line. The mapping
  category → collector rows is one const, `PULSE_CATEGORY_COLLECTOR`. A category is missing
  when all its collectors fail. News with only some feeds failing is listed as partial
  ("news (2/3 feeds)"), not as healthy.
- The summary is a template over the top bearish and bullish drivers. The function is
  pure and lives next to `compute.ts`.

### 2.5 Tests (`src/scripts/pulse.test.ts`)

- An empty input, or fewer than `PULSE_MIN_INPUTS`, returns `insufficient`, never a zero.
- Monotonicity: adding a bearish signal never raises `value`.
- The category cap holds: 20 bearish news rows give at most `cap · W.news` of raw.
- A duplicate cluster counts once.
- Conflict fires exactly at the threshold boundary.
- An opinion row with weight 0 does not move `value`.
- A news row with `content_type` null is excluded and does not count toward
  `PULSE_MIN_INPUTS`.
- One MEDIUM bullish and one MEDIUM bearish signal do not give Conflict; four MEDIUM
  signals across categories on each side do.
- A golden case: the 2026-10-07 02:00Z ETH signal set (fixture) gives `value < −20` or
  `conflict = true` for scope ETH.

---

## 3. Data model

Migration: the next free number in `db/migrations/` at implementation time. House style
of `0001_analytics.sql`.

```sql
create table if not exists public.market_pulse (
    id              bigint      generated always as identity primary key,
    scope           text        not null check (scope in ('market','BTC','ETH','SOL')),
    computed_at     timestamptz not null,          -- the collect run's input time
    bull            smallint    not null check (bull between 0 and 100),
    bear            smallint    not null check (bear between 0 and 100),
    value           smallint    not null check (value between -100 and 100),
    conflict        boolean     not null,
    input_count     int         not null,
    drivers         jsonb       not null,          -- [{signal_id, label, display, c}]
    missing         text[]      not null default '{}',
    model_version   int         not null,          -- PULSE_MODEL_VERSION; bump on any weight/formula change
    constraint market_pulse_scope_ts_key unique (scope, computed_at)
);
create index if not exists market_pulse_recent_idx on public.market_pulse (scope, computed_at desc);

create table if not exists public.macro_readings (
    series      text        not null,              -- FRED series id
    obs_date    date        not null,
    value       numeric     not null,
    fetched_at  timestamptz not null default now(),
    primary key (series, obs_date)
);

create table if not exists public.pulse_notifications (
    id          bigint      generated always as identity primary key,
    scope       text        not null,
    type        text        not null check (type in ('bear_confluence','bull_confluence','conflict','reversal')),
    pulse_id    bigint      not null references public.market_pulse (id),
    sent_at     timestamptz not null,
    validated   boolean     not null                -- false under Verdict B
);
```

Changes to `public.news_classifications`: `content_type text check (content_type in
('event','opinion'))`, nullable for rows under older prompt versions. Changes to
`public.news_items`: `cluster_id bigint` (nullable; §5.3).

Neon budget: 4 pulse rows per hour (~3k/month), and a handful of macro and notification
rows. Negligible.

`model_version` is on `market_pulse` for the same reason `prompt_version` is on forecasts
(README §4 rule 3): changing weights must not silently rewrite what past values meant.

---

## 4. Rules (extends `src/lib/signals/rules/`)

### 4.1 Lookback input

`range_break` needs 14 days of 4h highs and lows. The current rule signature is
`(snapshot, previous)`. Extend it to `(snapshot, previous, ctx)`, where
`ctx.history4h: Candle[]` is loaded **once per run per asset**, with `fetchKlines` 4h (limit ≥ 85: 84 closed candles for 14 days plus the open one). Stored
snapshots are not used: they may not hold 4h highs and lows. The still-open candle is
dropped before any rule sees the series. Existing rules ignore `ctx`. Do not give each rule its own fetch.

### 4.2 Rule details

| Rule | Inputs | Notes |
|---|---|---|
| `etf_streak` | `etf_streak_days` (unsigned), `etf_net_flow_usd` | Sign from the flow (repo-level `decisions.md` §8 #1). New thresholds `ETF_STREAK_MIN_DAYS = 3`, `ETF_SINGLE_DAY_USD = 100e6` |
| `long_flush` / `short_squeeze` | OI and price on `snapshot` vs `previous` | Requires `previous` to be one collection interval earlier, within a tolerance (`SIGNALS_PREV_GAP_MIN_MINUTES` 45 to `SIGNALS_PREV_GAP_MAX_MINUTES` 90), because GitHub Actions cron runs late or skips. A larger gap returns null; a 3h change is not a 1h change |
| `price_velocity` | 1h close vs previous | Same gap rule |
| `range_break` | `ctx.history4h` (closed candles), close of the last closed candle | Reference = lowest low / highest high of the 84 closed candles **before** the last closed one. Buffer `RANGE_BREAK_BUFFER_PCT = 0.3` so a one-tick poke is not a break. One closed 4h candle, not two: this card is an early warning. The forecast log's "two closes with a buffer" rule is for forecast triggers, not for this card |
| `rsi_1h_extreme` | 1h RSI | Sign: ≤ 25 BULLISH, ≥ 75 BEARISH, severity LOW. Only if the snapshot stores 1h RSI. If it does not, add it to the snapshot builder; do not compute it in the rule |
| `macro_brent`, `macro_10y`, `macro_dollar` | latest two `macro_readings` per series | Scope `market`. Null if either reading is missing, or the latest is older than `MACRO_MAX_AGE_DAYS` for that series: `DGS10` 4 (weekends), `DCOILBRENTEU` 10 and `DTWEXBGS` 12 (both arrive in weekly batches, functional §2.4). The card text carries the observation date |

Every threshold goes in `src/consts/signals.ts`, and every rule keeps the null discipline.

### 4.3 Read path change

`/api/signals` stops truncating to `SIGNALS_COUNT`. It returns all live rows. The UI
expands the top 6 and collapses the rest. `SIGNALS_COUNT` becomes the expanded count,
renamed `SIGNALS_EXPANDED_COUNT`.

---

## 5. News changes (spec 015 code)

### 5.1 Prompt (bump `NEWS_PROMPT_VERSION`)

Add to `NEWS_CLASSIFY_SYSTEM_PROMPT`:
- Macro and geopolitical shocks (war, energy supply, rates, sanctions, tariffs) are scope
  `market` and magnitude at least `MEDIUM`.
- Classify `content_type`: `event` vs `opinion`, with examples of each.
- The horizon must respect the magnitude caps (functional §2.5.4).

Validation in `classify.ts` drops (never coerces) a row whose horizon exceeds its
magnitude's cap, or whose `content_type` is missing under the new version.

Re-classify the last 7 days under the new version. This **inserts** new rows; old rows
stay (spec 015 §2.1).

### 5.2 Horizon caps

`NEWS_HORIZON_CAP_HOURS = { LOW: 72, MEDIUM: 336, HIGH: 720 }` in `src/consts/news.ts`.

### 5.3 Duplicate clustering (`src/lib/news/cluster.ts`, pure)

At ingest, compare a new item's title against items from the last 24h. This is the method
as implemented in Slice 1; it supersedes the earlier Jaccard ≥ 0.5 design (this spec's
`decisions.md`, 10-07 entries):

1. Normalise: lowercase, punctuation stripped. Strip a **series prefix** first: only a short
   leading segment of at most 4 words before the first colon ("Live updates:"). A longer
   segment is content and stays. Stop-word lists were rejected: every new column would
   cause a new false merge.
2. Score with the **overlap coefficient** (shared tokens ÷ the smaller title), threshold
   `NEWS_CLUSTER_OVERLAP` (0.35). Real cross-outlet duplicates score only 0.19–0.44 Jaccard.
3. Require **≥ 2 shared named entities**. A token is an entity if capitalised in EITHER
   headline or listed in the alias map in `src/consts/news.ts` (bitcoin/Bitcoin,
   ether/Ethereum, J.P. Morgan/JPMorgan). Compare case-insensitively.

On a match, assign the matched item's `cluster_id`; otherwise `cluster_id = id`.
The read path collapses a cluster into one card listing every source. Tests use the
duplicate pairs from functional §0.

This is the "add title-similarity dedup as a follow-on" that spec 015 §3 deferred until
the feed became visibly repetitive. It now is.

### 5.4 Cointelegraph

Check `src/consts/news.ts` feed URL and the rss2json response for that feed. Whatever the
cause, the outcome must be visible in `public.collector_status` with a per-feed row.
Today a feed can return zero items and look healthy.

---

## 6. Macro collector (`src/lib/collectors/macro.ts`)

- FRED API, `FRED_API_KEY` env var (free). Series ids live in `src/consts/macro.ts`.
- Runs inside `/api/collect` but is gated to once per `MACRO_FETCH_INTERVAL_HOURS` (6),
  the same pattern as the news classify interval.
- Upserts `macro_readings` on `(series, obs_date)`. FRED's `"."` value for missing days is
  skipped, not stored as 0.
- Records success or failure in `collector_status` under `macro`.
- **Attribution (FRED API Terms of Use):** `FredAttribution` (`src/components/layout/FredAttribution.tsx`)
  renders the required sentence and the Terms link. It is mounted in the `(admin)` layout footer
  and the landing footer. Macro cards on `/signals` show "Source: FRED, as of <MM-DD>" from the
  signal's `since` (the observation date). Do not add the FRB logo or put "FRED" or "Federal
  Reserve" in any name, hostname or branding. Any new page layout that does not reuse these two
  footers must mount `FredAttribution` too.
- **Cadence:** `DGS10` is daily; `DCOILBRENTEU` and `DTWEXBGS` arrive in weekly batches
  (functional §2.4). The 6h gate is still right; most runs add nothing.
- **Reachability check first:** the repo-level `decisions.md` §10 says agents cannot reach some hosts from
  their environment. Confirm FRED is reachable from the GitHub Actions runner and from
  Vercel `fra1` before building the rules on it (a one-off `workflow_dispatch`, as spec 018).

### 6.1 Event calendar

`src/data/macro-calendar.json`: `[{ "ts": ISO, "title": "Fed minutes", "importance": "high" }]`.
It is maintained by hand. `/api/pulse` returns the next entry within 72h. If the file is
older than 30 days by its own `updated` field, the block omits the event line rather than
show a stale calendar as current.

---

## 7. API and UI

`GET /api/pulse?scope=market|BTC|ETH|SOL`, `dynamic = 'force-dynamic'`:

```ts
type PulseResponse =
  | { status: 'ok'; scope: string; computedAt: string; bull: number; bear: number;
      value: number; conflict: boolean; inputCount: number;
      drivers: { signalId: string; label: string; display: string; sign: 1 | -1 }[];
      summary: string; missing: string[]; prev24h: number | null;
      nextEvent: { ts: string; title: string } | null; modelVersion: number }
  | { status: 'stale'; computedAt: string }                    // no numbers
  | { status: 'insufficient'; inputCount: number }
  | { status: 'unavailable' };
```

`stale` deliberately carries no numeric fields. The UI greys the bar using the last
`ok` value it already holds client-side, and labels it stale. It never fetches a number
the API refused to vouch for. On a fresh load with no held value it shows text only
(functional §2.2). `prev24h` is the row nearest to `computedAt − 24h` within
`PULSE_PREV24H_TOLERANCE_HOURS` (2), else null, and the ghost marker is hidden. An unknown
`scope` returns 400.

UI: `src/components/signals/MarketPulse.tsx` and `useMarketPulse(scope)` (SWR, 60s, same
interval as `useSignals`).
- The gradient uses existing theme tokens. Add `--pulse-bear`, `--pulse-range`,
  `--pulse-bull` to the token file rather than hex values in the component.
- Conflict uses a CSS repeating-linear-gradient stripe over the fill.
- Text sizes come from the consolidated type scale only (≥ 12px).
- Driver chip click: `scrollIntoView` + a 2s highlight ring on the card with matching
  `id`. Cards collapsed under "Show more" expand first.
- Accessibility: the bar has `role="meter"`, `aria-valuemin=-100`, `aria-valuemax=100`,
  `aria-valuenow`, and `aria-valuetext` such as "Bearish, −38, conflict".

---

## 8. Notifications (`src/lib/pulse/notify.ts`)

- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APP_BASE_URL` (for the `/signals` link), `PULSE_NOTIFY_VERDICT` (`A|B|C`, unset =
  off). Missing token or chat id = notifications off and status `disabled`, not an error.
- Runs after pulse compute in the same collect run. Decides per scope from the new pulse
  row, the previous rows, and `pulse_notifications` (24h dedupe per type and scope).
- Sends one `sendMessage` (HTML parse mode) per decision. A Telegram failure is logged to
  `collector_status` under `telegram` and never fails the run.
- Under Verdict B every message starts with "Unvalidated (backtest n = <n>)" (n per type and scope from `PULSE_BACKTEST_N`, updated after each backtest run), and the row
  stores `validated = false`.

### 8.1 Backtest (`src/scripts/pulse-backtest.ts`, GitHub Actions `workflow_dispatch`)

- Rebuild the signal set for every live-collected hour (`raw->>'backfill'` is not true).
  Run the market-state rules over the stored snapshots and use stored news rows with
  their published times. **No look-ahead:** an hour's set uses only rows that existed at
  that hour. Assert this in a test.
- Run `compute.ts` and `notify`'s decision function (pure; no send) over that series.
- Outcome: from the alert hour's close, whether any 1h close in the next 72h is ≥ 5% below
  it (bearish alert) or ≥ 5% above it (bullish alert). Price series: the scope's own;
  `market` uses BTC.
- Report per scope and type: alerts n, hits, false alarms, and the same-direction
  unconditional base rate (share of all hours followed by such a move), plus a one-sided
  binomial p-value. Only alerts at least 72h apart count toward n. Upload as an artifact and paste into functional §2.8.

---

## 9. Constants (`src/consts/pulse.ts`)

`PULSE_MODEL_VERSION`, `PULSE_WEIGHTS`, `PULSE_K`, `PULSE_CATEGORY_CAP`,
`PULSE_CONFLICT_MIN`, `PULSE_MIN_INPUTS` (5), `PULSE_OPINION_WEIGHT`,
`PULSE_RULE_CATEGORY` (rule_id → category), `PULSE_ALERT_MIN_CATEGORIES`,
`PULSE_ALERT_BEAR_MIN` (60), `PULSE_REVERSAL_POINTS` (40), `PULSE_OI_FLUSH_PCT` (3),
`PULSE_PRICE_FLUSH_PCT` (2), `PULSE_ZONE_THRESHOLD` (20), `PULSE_SEVERITY`,
`PULSE_CATEGORY_COLLECTOR`, `PULSE_PREV24H_TOLERANCE_HOURS` (2), `PULSE_BACKTEST_N`.

Elsewhere: `MACRO_MAX_AGE_DAYS`, `MACRO_DECAY_HOURS` (72) in `src/consts/macro.ts`;
`SIGNALS_PREV_GAP_MIN_MINUTES` (45), `SIGNALS_PREV_GAP_MAX_MINUTES` (90),
`RANGE_BREAK_BUFFER_PCT` in `src/consts/signals.ts`; `NEWS_CLUSTER_OVERLAP` (0.35) in
`src/consts/news.ts`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| The bar looks authoritative while its weights are guesses | Disclaimer on the surface, `model_version` on every row, §2.8 gate, and weights flagged for spec 011 follow-on |
| News volume dominates the bar | Per-category cap, cluster collapse, opinion weight 0 |
| One dead collector quietly shifts the bar | `missing` is shown on the surface; a category is never imputed as neutral |
| Alert fatigue | 24h dedupe per type and scope; confluence needs ≥ 4 distinct categories, not 4 signals of one kind |
| FRED unreachable from the runner | Reachability check before Slice 3; macro is a category, so the Pulse degrades with "Without: macro" |
| Re-classification cost | 7 days × ~40 items, batched on Haiku: cents. Measured through `cost_usd` |
| `range_break` fires on noise | 0.3% buffer; closed 4h candles only |
| The §2.8 gate cannot reach Verdict A on about three weeks of live history | Expect Verdict B; the "Unvalidated" label is the mitigation; re-run monthly |
| Brent and dollar data arrive in weekly batches | Observation date on the card, per-series max age, decay by observation age; macro is treated as backdrop, not as the shock detector |

**Reversibility:** high. Turning the Pulse off means hiding the block. Rule and news
changes stand on their own merit.
