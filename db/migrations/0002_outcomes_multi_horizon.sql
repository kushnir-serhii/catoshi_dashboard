-- 0002_outcomes_multi_horizon.sql
-- Spec 010 — follow-up to 0001.
--
-- Why: /api/projections returns a 365-day curve per scenario (bull/base/bear
-- as arrays of {d, p}), not a single-horizon range. One forecast is therefore
-- scored repeatedly — at day 1, day 7, day 30 — and each scoring is its own
-- outcome row. `outcomes.horizon_days` already anticipated this, but
-- `unique (forecast_id)` allowed only one row per forecast, so the two
-- contradicted each other and the second scoring would have failed.
--
-- Also makes horizon_days NOT NULL. Two reasons: an outcome without a horizon
-- cannot be interpreted, and in Postgres NULLs are distinct inside a unique
-- constraint, so (42, NULL) twice would both be accepted and the new
-- constraint would not actually constrain anything.
--
-- Every statement here is idempotent: the constraint swap may already have
-- been applied by hand, and re-running must neither fail nor undo it.
--
-- Safe on a populated table only while outcomes is empty, which it is until
-- spec 011 ships.

alter table public.outcomes
  drop constraint if exists outcomes_forecast_id_key;

alter table public.outcomes
  alter column horizon_days set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.outcomes'::regclass
      and conname  = 'outcomes_forecast_horizon_key'
  ) then
    alter table public.outcomes
      add constraint outcomes_forecast_horizon_key unique (forecast_id, horizon_days);
  end if;
end $$;

comment on column public.outcomes.horizon_days is
  'Days after the forecast at which it was scored. One forecast yields several '
  'outcome rows — typically 1, 7 and 30 — since a forecast is a curve, not a '
  'single-horizon call. Part of the uniqueness key.';

-- Spec 011 resolves forecasts whose horizon has elapsed; this is the lookup
-- that job will run, so it gets an index rather than a sequential scan.
create index if not exists idx_outcomes_forecast_horizon
  on public.outcomes (forecast_id, horizon_days);
