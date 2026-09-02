-- 0005_outcome_scores.sql
-- Spec 011 — Forecast Scoring.
--
-- Adds outcomes.brier_score: the Brier score of the forecast's scenario
-- probabilities against the realised scenario, for the horizon this row scores.
--
-- Why `double precision`, not `numeric`: this is a statistical quantity
-- aggregated across thousands of rows for a model-accuracy metric — never money.
-- The named check constraint carries the meaning: a valid multi-class Brier
-- score sits in [0, 2], and an unscoreable outcome holds NULL rather than a
-- faked zero.
--
-- Every statement is idempotent: the column add is `if not exists`, and the
-- constraint is added only when absent (mirrors 0002's pattern), so re-running
-- neither fails nor undoes it.
--
-- Safe on a populated table: the column is nullable with no default, and the
-- check permits NULL.

alter table public.outcomes
  add column if not exists brier_score double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.outcomes'::regclass
      and conname  = 'outcomes_brier_score_check'
  ) then
    alter table public.outcomes
      add constraint outcomes_brier_score_check
        check (brier_score is null or (brier_score >= 0 and brier_score <= 2));
  end if;
end $$;

comment on column public.outcomes.brier_score is
  'Brier score of the forecast''s scenario probabilities vs the realised '
  'scenario, for this row''s horizon. In [0, 2]; NULL when the outcome cannot '
  'be scored (no probabilities, no realised scenario).';
