-- 0012_calibration_by_horizon.sql
-- Spec 026 — Forecast accuracy by horizon.
--
-- Splits the Models-page mean Brier by the horizon a forecast was scored at
-- (1 / 7 / 30 days), so the page can show where a model is accurate rather than
-- one blended figure.
--
-- This reuses `public.calibration_base` and its `exclusion_reason` (migration
-- 0006), the single definition of what is set aside. The filter here is the same
-- `exclusion_reason is null` used by `public.calibration_scores`, so the
-- per-horizon `scored_count`s sum to that view's `scored_count` for the same
-- (model, prompt_version). No exclusion rule is re-implemented.
--
-- Idempotent: `create or replace view` with a `public.` prefix. Re-running
-- replaces the definition in place; no table is created or altered and no data
-- is touched.

create or replace view public.calibration_scores_by_horizon as
select
  model,
  prompt_version,
  horizon_days,
  count(*) filter (where exclusion_reason is null)         ::int as scored_count,
  avg(brier_score) filter (where exclusion_reason is null) ::double precision as mean_brier
from public.calibration_base
group by model, prompt_version, horizon_days
order by model, prompt_version, horizon_days;

comment on view public.calibration_scores_by_horizon is
  'Spec 026: mean Brier per (model, prompt_version, horizon_days) over the '
  'included rows only (exclusion_reason is null, as in calibration_scores). '
  'scored_count is the sample behind mean_brier; mean_brier is NULL when '
  'scored_count = 0. Horizons with no outcomes have no row.';
