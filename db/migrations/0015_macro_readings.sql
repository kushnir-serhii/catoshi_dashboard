-- 0015_macro_readings.sql
-- Spec 027 (Market Pulse), Slice 3 — Macro + calendar.
--
-- Stores FRED observations for the Macro Pulse (10Y yield, Brent, USD index).
-- One row per (series, observation date); FRED revises values, so the collector
-- upserts on the key and refreshes `fetched_at`. FRED's "." (missing day) is
-- never stored.
--
-- Idempotent: `create table if not exists`. House style follows 0001/0007.

create table if not exists public.macro_readings (
  series      text        not null,
  obs_date    date        not null,
  value       numeric     not null,
  fetched_at  timestamptz not null default now(),

  primary key (series, obs_date),
  constraint macro_readings_series_not_blank check (length(trim(series)) > 0)
);

comment on table public.macro_readings is
  'FRED observations for the Macro Pulse, upserted by the macro collector (spec 027, Slice 3).';
comment on column public.macro_readings.series is
  'FRED series id, e.g. DGS10, DCOILBRENTEU, DTWEXBGS.';
comment on column public.macro_readings.obs_date is
  'Observation date as published by FRED.';
comment on column public.macro_readings.fetched_at is
  'When this value was last fetched/refreshed; also drives the macro collector 6h gate.';
