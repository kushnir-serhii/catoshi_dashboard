-- 0004_signals.sql
-- Spec 014 — Signals From Market State.
--
-- Creates public.signals: one row each time a deterministic rule fires over a
-- snapshot. Matches the house style of 0001_analytics.sql — `public.` prefix,
-- identity column rather than `serial`, named constraints.
--
-- Provenance: (asset_id, rule_id, snapshot_ts) reconstructs any signal from the
-- snapshots row that produced it, and doubles as the idempotency key so
-- re-running a collection hour upserts rather than duplicates.
--
-- Nullability: every column is NOT NULL. A rule that lacks an input returns null
-- and no row is written (technical-considerations §4, null discipline) — the
-- table never stores a signal built on a missing reading.

create table if not exists public.signals (
  id           bigint      generated always as identity primary key,
  asset_id     bigint      not null references public.assets (id) on delete cascade,
  rule_id      text        not null,
  snapshot_ts  timestamptz not null,
  since_ts     timestamptz not null,
  tag          text        not null check (tag in ('BULLISH', 'BEARISH', 'NEUTRAL')),
  title        text        not null,
  body         text        not null,
  source       text        not null,
  severity     real        not null check (severity >= 0 and severity <= 1),
  created_at   timestamptz not null default now(),

  constraint signals_asset_rule_ts_key unique (asset_id, rule_id, snapshot_ts)
);

comment on table public.signals is 'One row per rule firing per snapshot hour. UNIQUE (asset_id, rule_id, snapshot_ts) makes re-runs idempotent and carries provenance back to the snapshot.';
comment on column public.signals.rule_id is 'Identifier of the pure rule that produced the row, e.g. rsi_1d_overbought.';
comment on column public.signals.snapshot_ts is 'ts of the snapshot the signal was derived from.';
comment on column public.signals.since_ts is 'When the condition first began holding across consecutive runs; equals snapshot_ts on first fire.';
comment on column public.signals.severity is 'Normalised distance past the rule threshold, clamped to 0..1. Governs card ordering.';

-- Read path: newest signals within the freshness window, most severe first.
create index if not exists signals_recent_idx
  on public.signals (snapshot_ts desc, severity desc);
