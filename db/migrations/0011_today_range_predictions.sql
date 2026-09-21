-- 0011_today_range_predictions.sql
-- Spec 024 — Today Range & Level Probability, Slice 4 (daily scoring).
--
-- One row per (asset, issue time): the 50%/90% price band the zero-drift model
-- predicted for the next 24h, later filled in with what the market actually did
-- so `/api/today` can report how often the 90% band held. Rows are issued and
-- resolved by the hourly /api/collect run (src/lib/todayScoring.ts).
--
-- Rules that live here so they cannot be bypassed by application code:
--   * `issued_at` is the run's real time floored to the hour, never backdated;
--     `horizon_end = issued_at + 24h` (checked below).
--   * a row is either fully unresolved or fully resolved (realized_* and
--     in_band_* and resolved_at all NULL, or all set).
--   * the model that produced a row is stamped in `model_version`; the track
--     record only ever reads the current version, never mixing models.
--   * one row per asset per UTC day is enforced in the writer (insert ... where
--     not exists), not by an expression index; UNIQUE (asset_id, issued_at)
--     makes concurrent same-hour runs idempotent.
--
-- `assets.id` is bigint (0001_analytics.sql), so `asset_id` is bigint, not int.
-- House style follows 0007_collector_status.sql: `public.` prefix, named
-- constraints, idempotent DDL.

create table if not exists public.today_range_predictions (
  id              bigint generated always as identity primary key,
  asset_id        bigint      not null references public.assets (id),
  issued_at       timestamptz not null,
  horizon_end     timestamptz not null,
  spot            numeric     not null,
  sigma_hourly    numeric     not null,
  k               numeric     not null,
  model_version   int         not null,
  p05             numeric     not null,
  p25             numeric     not null,
  p75             numeric     not null,
  p95             numeric     not null,
  realized_close  numeric,
  realized_high   numeric,
  realized_low    numeric,
  in_band_50      boolean,
  in_band_90      boolean,
  resolved_at     timestamptz,

  constraint today_range_predictions_asset_issued_key unique (asset_id, issued_at),
  constraint today_range_predictions_horizon_after_issue check (horizon_end > issued_at),
  constraint today_range_predictions_resolved_together check (
    (resolved_at is null
      and realized_close is null and realized_high is null and realized_low is null
      and in_band_50 is null and in_band_90 is null)
    or
    (resolved_at is not null
      and realized_close is not null and realized_high is not null and realized_low is not null
      and in_band_50 is not null and in_band_90 is not null)
  )
);

-- Track-record read: last N resolved rows for one asset + model version.
create index if not exists today_range_predictions_track_idx
  on public.today_range_predictions (asset_id, model_version, resolved_at desc)
  where resolved_at is not null;

-- Resolver read: unresolved rows whose horizon has elapsed (a tiny set).
create index if not exists today_range_predictions_unresolved_idx
  on public.today_range_predictions (horizon_end)
  where resolved_at is null;

comment on table public.today_range_predictions is
  'Daily 50%/90% price-band predictions of the Today Range model and their realized outcome (spec 024, Slice 4).';
comment on column public.today_range_predictions.issued_at is
  'Actual run time floored to the hour. Never backdated: a missed 00:00 run issues at its own hour.';
comment on column public.today_range_predictions.sigma_hourly is
  'Hourly sigma already multiplied by k (k * sqrt(EWMA variance)).';
comment on column public.today_range_predictions.realized_close is
  'Close of the 1h bar ending at horizon_end. NULL until resolved; never guessed.';
comment on column public.today_range_predictions.realized_high is
  'Highest 1h high over [issued_at, horizon_end).';
comment on column public.today_range_predictions.realized_low is
  'Lowest 1h low over [issued_at, horizon_end).';
