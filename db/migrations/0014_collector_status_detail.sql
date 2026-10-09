-- 0014_collector_status_detail.sql
-- Spec 027 (Market Pulse), Slice 1 — News quality.
--
-- Adds one nullable column to public.collector_status:
--   detail  the run's `SourceStatus.note` for that source (e.g. the
--     `news:classify` drop counters: classified=N scope_drop=.. horizon_cap=..),
--     so per-run drops are visible instead of failing silently. Overwritten on
--     every attempt; NULL when the run carried no note. Independent of
--     last_error / last_success_at.
--
-- Idempotent: `add column if not exists`. No data is rewritten.

alter table public.collector_status
  add column if not exists detail text;

comment on column public.collector_status.detail is
  'Note from the latest attempt (e.g. news:classify drop counters). NULL when the run carried none.';
