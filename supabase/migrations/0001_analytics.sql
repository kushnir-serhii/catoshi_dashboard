-- 0001_analytics.sql
-- Spec 010 — Market Snapshot Store.
-- Creates the four analytics tables: assets, snapshots, forecasts, outcomes.
--
-- Nullability rule (technical-considerations §3.1): every derivative and flow
-- column is nullable. A snapshot missing one source is still a valid snapshot.
-- NOT NULL is reserved for snapshots.asset_id, snapshots.ts and snapshots.price.
--
-- Sections 6 (constraints/triggers) and 7 (indexes) are appended by follow-up
-- tasks in the same slice. Do not reorder the sections above them.

-- ---------------------------------------------------------------------------
-- 1. assets — symbol <-> Binance pair <-> CoinGecko id
-- ---------------------------------------------------------------------------

create table if not exists public.assets (
  id            bigint generated always as identity primary key,
  symbol        text        not null unique,
  name          text,
  binance_pair  text        not null unique,
  coingecko_id  text        not null unique,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.assets is 'Tracked assets: symbol, Binance futures pair and CoinGecko id.';

-- ---------------------------------------------------------------------------
-- 2. snapshots — one row per asset per hour
-- ---------------------------------------------------------------------------

create table if not exists public.snapshots (
  id                            bigint generated always as identity primary key,
  asset_id                      bigint      not null references public.assets (id) on delete cascade,
  -- The hour the snapshot describes, truncated server-side. Actions schedule
  -- drift must not create two rows for the same hour.
  ts                            timestamptz not null,
  created_at                    timestamptz not null default now(),

  -- Market ------------------------------------------------------------------
  price                         numeric     not null,
  market_cap_usd                numeric,
  volume_24h_usd                numeric,

  -- Indicators: RSI per timeframe -------------------------------------------
  rsi_15m                       double precision,
  rsi_1h                        double precision,
  rsi_4h                        double precision,
  rsi_1d                        double precision,

  -- Indicators: daily moving averages and percent distance from each ---------
  ma7_1d                        numeric,
  ma25_1d                       numeric,
  ma99_1d                       numeric,
  pct_from_ma7_1d               double precision,
  pct_from_ma25_1d              double precision,
  pct_from_ma99_1d              double precision,

  -- Indicators: volatility, volume anomaly, market structure ----------------
  atr_1d                        double precision,
  volume_z_1d                   double precision,
  structure_1d                  text,

  -- Derivatives (Binance futures) -------------------------------------------
  funding_rate                  double precision,
  funding_rate_delta_24h        double precision,
  open_interest_usd             numeric,
  open_interest_change_24h_pct  double precision,
  long_short_ratio              double precision,
  -- Liquidations require the !forceOrder@arr WebSocket stream, which has no
  -- stateless hourly REST equivalent. Columns exist; they stay NULL (§5).
  liquidations_24h_usd          numeric,
  liquidations_dominant_side    text,

  -- Flow and sentiment ------------------------------------------------------
  etf_net_flow_usd              numeric,
  etf_streak_days               integer,
  etf_flow_7d_usd               numeric,
  -- Fear & Greed is market-wide, not per-asset; stored on every snapshot.
  fear_greed                    integer,
  fear_greed_7d_ago             integer,

  -- Everything gathered, so a new source needs no migration -----------------
  raw                           jsonb default '{}'::jsonb,

  constraint snapshots_asset_ts_key unique (asset_id, ts),
  constraint snapshots_structure_1d_check
    check (structure_1d is null or structure_1d in ('HH-HL', 'LH-LL', 'RANGE')),
  constraint snapshots_liq_side_check
    check (liquidations_dominant_side is null or liquidations_dominant_side in ('long', 'short'))
);

comment on table public.snapshots is 'One market snapshot per asset per hour. UNIQUE (asset_id, ts) makes re-runs idempotent.';
comment on column public.snapshots.ts is 'Hour the snapshot describes, truncated to the hour server-side.';
comment on column public.snapshots.raw is 'Full payload of everything gathered, so a new source can be added without a migration.';
comment on column public.snapshots.liquidations_24h_usd is 'Deferred: WebSocket-only source. Stays NULL until an aggregator exists.';

-- ---------------------------------------------------------------------------
-- 3. forecasts — one row per coin per generation
-- ---------------------------------------------------------------------------

create table if not exists public.forecasts (
  id              bigint      generated always as identity primary key,
  asset_id        bigint      not null references public.assets (id) on delete cascade,
  -- Conditions the forecast was made under. Nullable so a forecast is still
  -- recorded when no snapshot exists yet for the asset.
  snapshot_id     bigint      references public.snapshots (id) on delete set null,
  as_of           timestamptz not null default now(),

  scenarios       jsonb       not null,
  confidence      double precision,
  reasoning       text[],
  anchor_price    numeric,

  source          text        not null,
  model           text        not null,
  prompt_version  text        not null,
  schema_version  text,

  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(12, 6),

  created_at      timestamptz not null default now()
);

comment on table public.forecasts is 'One row per coin per genuine forecast generation (cache miss only).';
comment on column public.forecasts.source is 'AI service that produced the forecast, e.g. claude | openai.';
comment on column public.forecasts.prompt_version is 'Bumped whenever a provider prompt changes; without it the accuracy metric is meaningless.';
comment on column public.forecasts.anchor_price is 'Price the model anchored on at generation time.';

-- ---------------------------------------------------------------------------
-- 4. outcomes — created empty here, filled by spec 011
-- ---------------------------------------------------------------------------

create table if not exists public.outcomes (
  id                bigint      generated always as identity primary key,
  forecast_id       bigint      not null references public.forecasts (id) on delete cascade,
  horizon_days      integer,
  evaluated_at      timestamptz,
  entry_price       numeric,
  actual_price      numeric,
  actual_return_pct numeric generated always as (
    case
      when entry_price is null or entry_price = 0 or actual_price is null then null
      else (actual_price - entry_price) / entry_price * 100
    end
  ) stored,
  realized_scenario text,
  created_at        timestamptz not null default now(),

  constraint outcomes_forecast_id_key unique (forecast_id),
  constraint outcomes_realized_scenario_check
    check (realized_scenario is null or realized_scenario in ('bull', 'base', 'bear'))
);

comment on table public.outcomes is 'Realised result of a forecast. Created empty by spec 010; populated by spec 011.';

-- ---------------------------------------------------------------------------
-- 5. Seed data
-- ---------------------------------------------------------------------------

insert into public.assets (symbol, name, binance_pair, coingecko_id)
values
  ('BTC', 'Bitcoin', 'BTCUSDT', 'bitcoin'),
  ('ETH', 'Ethereum', 'ETHUSDT', 'ethereum'),
  ('SOL', 'Solana', 'SOLUSDT', 'solana')
on conflict (symbol) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Constraints and triggers
-- ---------------------------------------------------------------------------

-- Scenario probabilities must sum to 1 (AC 2.5). The tolerance exists because
-- AI providers return rounded probabilities that rarely sum to exactly 1.0.
--
-- Shape of `scenarios`: the app models scenarios as bull/base/bear (see
-- ScenarioProbabilities in src/data/types.ts, which normalizeProbabilities()
-- in src/lib/forecast/gridSnap.ts emits as WHOLE PERCENTAGE POINTS summing to
-- 100). The spec states the rule in fractions (1 +/- 0.02), so the check
-- accepts either convention: a sum within 0.02 of 1, or within 2 of 100.
-- Anything else -- 0.9, 0.5, 90 -- is rejected.
--
-- Extraction is deliberately tolerant of the container shape, since the
-- writer (persistForecasts, a later task) may store the probabilities as a
-- nested map, as an array of scenario objects, or as a flat bull/base/bear
-- map. All three are read here.

create or replace function public.forecasts_scenarios_probability_sum()
returns trigger
language plpgsql
as $fn$
declare
  probs   jsonb;
  total   numeric;
begin
  -- NOT NULL already guards the column; a non-container payload carries no
  -- probabilities to check, so it passes through untouched.
  if new.scenarios is null or jsonb_typeof(new.scenarios) not in ('object', 'array') then
    return new;
  end if;

  -- 1. Nested probability map: {"scenarioProbabilities": {"bull": 30, ...}}
  if jsonb_typeof(new.scenarios) = 'object' then
    probs := coalesce(
      new.scenarios -> 'scenarioProbabilities',
      new.scenarios -> 'probabilities'
    );
  end if;

  if probs is not null and jsonb_typeof(probs) = 'object' then
    select sum((value #>> '{}')::numeric)
      into total
      from jsonb_each(probs)
     where jsonb_typeof(value) = 'number';

  -- 2. Array of scenario objects: [{"name": "bull", "probability": 0.3}, ...]
  elsif jsonb_typeof(new.scenarios) = 'array' then
    select sum((element -> 'probability' #>> '{}')::numeric)
      into total
      from jsonb_array_elements(new.scenarios) as element
     where jsonb_typeof(element) = 'object'
       and jsonb_typeof(element -> 'probability') = 'number';

  -- 3. Flat map keyed by scenario name, either a bare number or an object
  --    carrying a `probability` key: {"bull": 0.3} / {"bull": {"probability": 0.3}}
  else
    select sum(
             case
               when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric
               else (value -> 'probability' #>> '{}')::numeric
             end
           )
      into total
      from jsonb_each(new.scenarios)
     where key in ('bull', 'base', 'bear')
       and (
         jsonb_typeof(value) = 'number'
         or (jsonb_typeof(value) = 'object' and jsonb_typeof(value -> 'probability') = 'number')
       );
  end if;

  -- An empty payload ({} / []) yields no probabilities: there is nothing to
  -- sum, so it is allowed through -- this trigger polices mis-summing
  -- probabilities, not the presence of scenarios (NOT NULL does that).
  if total is null then
    return new;
  end if;

  -- Fractions (sum ~1) and whole percentages (sum ~100) are both accepted.
  if abs(total - 1) > 0.02 and abs(total - 100) > 2 then
    raise exception
      'forecast scenario probabilities must sum to 1 (+/- 0.02), got %', total
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

comment on function public.forecasts_scenarios_probability_sum() is
  'AC 2.5: rejects a forecast whose scenario probabilities do not sum to 1 (+/- 0.02), or 100 (+/- 2) when stored as whole percentage points.';

drop trigger if exists forecasts_scenarios_probability_sum_trg on public.forecasts;

create trigger forecasts_scenarios_probability_sum_trg
  before insert or update on public.forecasts
  for each row
  execute function public.forecasts_scenarios_probability_sum();

-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------

-- snapshots.ts is append-mostly and queried by time range; BRIN is far
-- smaller than btree for this access pattern and is idempotent to (re)build.
create index if not exists idx_snapshots_ts_brin
  on public.snapshots using brin (ts);

-- Per-asset time-series lookups (e.g. "latest N snapshots for BTC") scan in
-- descending ts order.
create index if not exists idx_snapshots_asset_ts
  on public.snapshots (asset_id, ts desc);

-- Per-asset RSI(1d) screening/filtering.
create index if not exists idx_snapshots_asset_rsi1d
  on public.snapshots (asset_id, rsi_1d);

-- Per-asset forecast history, most recent first.
create index if not exists idx_forecasts_asset_asof
  on public.forecasts (asset_id, as_of desc);

-- Accuracy/analysis grouped by model + prompt version.
create index if not exists idx_forecasts_model_promptversion
  on public.forecasts (model, prompt_version);

-- Containment/path queries into the scenarios payload.
create index if not exists idx_forecasts_scenarios_gin
  on public.forecasts using gin (scenarios jsonb_path_ops);
