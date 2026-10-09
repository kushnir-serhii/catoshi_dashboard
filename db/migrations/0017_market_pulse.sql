-- 0017_market_pulse.sql
-- Spec 027 (Market Pulse), Slice 4 — Pulse history.
--
-- One row per (scope, collect run): the Pulse computed from the live signals at
-- `computed_at` (the run's input time). Written by /api/collect after news
-- publish and macro rules; read by /api/pulse for the latest value and for the
-- 1h/6h/24h deltas. An `insufficient` computation is NOT stored (the numeric
-- columns are NOT NULL and must never hold fake zeros).
--
--   * drivers      top contributors: [{signal_id, label, display, c}].
--   * missing      categories whose collectors were failing for this run.
--   * model_version PULSE_MODEL_VERSION; bump on any weight/formula change so a
--                  re-backtest can tell old and new rows apart.
--
-- Idempotent: `create ... if not exists`. House style follows 0015.

create table if not exists public.market_pulse (
  id             bigint      generated always as identity primary key,
  scope          text        not null,
  computed_at    timestamptz not null,
  bull           smallint    not null,
  bear           smallint    not null,
  value          smallint    not null,
  conflict       boolean     not null,
  input_count    int         not null,
  drivers        jsonb       not null,
  missing        text[]      not null default '{}',
  model_version  int         not null,

  constraint market_pulse_scope_check check (scope in ('market', 'BTC', 'ETH', 'SOL')),
  constraint market_pulse_bull_check  check (bull  between 0 and 100),
  constraint market_pulse_bear_check  check (bear  between 0 and 100),
  constraint market_pulse_value_check check (value between -100 and 100),
  constraint market_pulse_scope_ts_key unique (scope, computed_at)
);

create index if not exists market_pulse_recent_idx
  on public.market_pulse (scope, computed_at desc);

comment on table public.market_pulse is
  'Market Pulse history, one row per (scope, collect run); insufficient computations are not stored (spec 027, Slice 4).';
comment on column public.market_pulse.computed_at is
  'The collect run input time (hour-truncated), shared by all scopes of one run.';
comment on column public.market_pulse.drivers is
  'Top contributors as [{signal_id, label, display, c}]; c is the post-cap, post-weight contribution.';
comment on column public.market_pulse.missing is
  'Category labels whose collectors were failing for this run.';
comment on column public.market_pulse.model_version is
  'PULSE_MODEL_VERSION at compute time.';
