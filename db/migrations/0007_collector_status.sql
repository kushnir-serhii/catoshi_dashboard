-- 0007_collector_status.sql
-- Spec 017 — Collection Reliability & Deployment, Slice 3.
--
-- Persists the last outcome per collector source across runs, so `/api/health`
-- can report "which collectors succeeded, and when each last succeeded" over the
-- whole pipeline history rather than only within the current run's in-memory
-- `SourceStatus[]`.
--
-- CHOICE: a dedicated table keyed by `source`, NOT a jsonb blob on a settings
-- row. Reasons: (1) the requirement is that "a single source failing for six
-- hours is distinguishable from the whole run failing once" — that is a
-- per-source `last_success_at` that diverges from its peers, which a row-per-
-- source models directly and a jsonb blob only simulates; (2) `/api/health`
-- reads it with a plain indexed `select`, no jsonb extraction; (3) there is no
-- existing settings table to hang a jsonb row off, and inventing one is more
-- surface than this.
--
-- House style follows 0001_analytics.sql: `public.` prefix, identity column,
-- named constraints, idempotent DDL.

create table if not exists public.collector_status (
  source          text        primary key,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now(),

  constraint collector_status_source_not_blank check (length(trim(source)) > 0)
);

comment on table public.collector_status is
  'Last observed outcome per collector source, upserted after every /api/collect run (spec 017, Slice 3).';
comment on column public.collector_status.source is
  'Collector identifier, matching SourceStatus.source in the collect run, e.g. binance:BTC, coingecko:ETH, etf-flows, fear-greed.';
comment on column public.collector_status.last_success_at is
  'When this source last completed without error. Diverges from its peers when one source alone is failing.';
comment on column public.collector_status.last_attempt_at is
  'When this source was last attempted, whether or not it succeeded.';
comment on column public.collector_status.last_error is
  'Error message from the most recent failure; cleared to NULL on the next success.';
