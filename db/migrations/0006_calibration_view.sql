-- 0006_calibration_view.sql
-- Spec 011 — Forecast Scoring, Slice 5 ("Reading the scores").
--
-- The read layer for the Models page. Every exclusion the calibration figures
-- depend on is defined ONCE here, in `public.calibration_base.exclusion_reason`,
-- so nothing downstream — the `/api/models` route, the page, a future analysis
-- script — can quietly apply a different rule:
--
--   * snapshot_unlinked   — forecast has no linked snapshot (functional-spec 2.6,
--                           `forecasts.snapshot_id is null`): it cannot be judged
--                           under "conditions that were actually current".
--   * backfilled_snapshot — forecast linked to a back-filled snapshot (spec 013,
--                           functional-spec 2.5). The documented marker predicate
--                           is `coalesce((raw->>'backfill')::boolean, false)`.
--                           Back-filled rows carry only price-derived fields, so
--                           scoring against one judges the model under conditions
--                           that were never observed.
--   * unscoreable         — no Brier score / no realized scenario (functional-spec
--                           2.2, 2.3): a degenerate scenario curve, rejected
--                           probabilities, or a missing entry price. Never a zero.
--
-- A row with `exclusion_reason is null` is IN; anything else is OUT and counted.
--
-- Idempotent: every object is `create or replace view` with a `public.` prefix.
-- Re-running replaces the definitions in place and touches no data.

-- ---------------------------------------------------------------------------
-- 1. calibration_base — one row per resolved (forecast, horizon), classified.
--    This is the single place the exclusion rules live.
-- ---------------------------------------------------------------------------

create or replace view public.calibration_base as
select
  o.id                 as outcome_id,
  f.id                 as forecast_id,
  f.model              as model,
  f.prompt_version     as prompt_version,
  f.as_of              as as_of,
  o.horizon_days       as horizon_days,
  o.brier_score        as brier_score,
  o.realized_scenario  as realized_scenario,
  case
    when f.snapshot_id is null
      then 'snapshot_unlinked'
    when coalesce((s.raw ->> 'backfill')::boolean, false)
      then 'backfilled_snapshot'
    when o.brier_score is null or o.realized_scenario is null
      then 'unscoreable'
    else null
  end                  as exclusion_reason
from public.outcomes o
join public.forecasts f on f.id = o.forecast_id
left join public.snapshots s on s.id = f.snapshot_id;

comment on view public.calibration_base is
  'Spec 011 Slice 5: one row per resolved (forecast, horizon). '
  'exclusion_reason is the single definition of what is set aside from every '
  'calibration figure — NULL means the row counts. Do not re-implement these '
  'rules anywhere else.';

-- ---------------------------------------------------------------------------
-- 2. calibration_scores — mean Brier per (model, prompt_version), with the
--    count behind the aggregate and the number excluded, by reason.
-- ---------------------------------------------------------------------------

create or replace view public.calibration_scores as
select
  model,
  prompt_version,
  count(*) filter (where exclusion_reason is null)                 ::int as scored_count,
  avg(brier_score) filter (where exclusion_reason is null)   ::double precision as mean_brier,
  count(*) filter (where exclusion_reason is not null)             ::int as excluded_count,
  count(*) filter (where exclusion_reason = 'backfilled_snapshot') ::int as excluded_backfilled,
  count(*) filter (where exclusion_reason = 'snapshot_unlinked')   ::int as excluded_unlinked,
  count(*) filter (where exclusion_reason = 'unscoreable')         ::int as excluded_unscoreable,
  count(*)                                                         ::int as total_outcomes
from public.calibration_base
group by model, prompt_version
order by model, prompt_version;

comment on view public.calibration_scores is
  'Spec 011 Slice 5: mean Brier score per (model, prompt_version). scored_count '
  'is the sample behind mean_brier; excluded_* count what calibration_base set '
  'aside and why. mean_brier is NULL until scored_count > 0.';

-- ---------------------------------------------------------------------------
-- 3. calibration_trend — the same mean, split by calendar month, so the page
--    can show the score falling month over month (functional-spec 2.8).
--    Months with no scoreable outcome are omitted, never shown as zero.
-- ---------------------------------------------------------------------------

create or replace view public.calibration_trend as
select
  model,
  prompt_version,
  date_trunc('month', as_of)                              as month,
  count(*) filter (where exclusion_reason is null) ::int  as scored_count,
  avg(brier_score) filter (where exclusion_reason is null) ::double precision as mean_brier
from public.calibration_base
group by model, prompt_version, date_trunc('month', as_of)
having count(*) filter (where exclusion_reason is null) > 0
order by model, prompt_version, month;

comment on view public.calibration_trend is
  'Spec 011 Slice 5: mean Brier per (model, prompt_version, month) over the '
  'included rows only. Feeds the Models-page trend series.';

-- ---------------------------------------------------------------------------
-- 4. calibration_exclusions — one row, product-wide totals, so the route can
--    report "how many set aside and why" without doing any arithmetic itself.
-- ---------------------------------------------------------------------------

create or replace view public.calibration_exclusions as
select
  count(*)                                                         ::int as total_outcomes,
  count(*) filter (where exclusion_reason is null)                 ::int as scored_count,
  count(*) filter (where exclusion_reason is not null)             ::int as excluded_count,
  count(*) filter (where exclusion_reason = 'backfilled_snapshot') ::int as excluded_backfilled,
  count(*) filter (where exclusion_reason = 'snapshot_unlinked')   ::int as excluded_unlinked,
  count(*) filter (where exclusion_reason = 'unscoreable')         ::int as excluded_unscoreable
from public.calibration_base;

comment on view public.calibration_exclusions is
  'Spec 011 Slice 5: single-row, product-wide calibration totals and the '
  'excluded breakdown by reason. Always returns exactly one row.';
