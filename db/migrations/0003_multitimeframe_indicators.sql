-- 0003_multitimeframe_indicators.sql
-- Spec 010 — closes an AC 2.4 gap left by 0001.
--
-- AC 2.4: "RSI and moving averages are computed for the 15-minute, 1-hour,
-- 4-hour and daily timeframes." 0001 computed RSI at all four timeframes
-- (rsi_15m/1h/4h/1d) but moving averages, ATR, volume z-score and market
-- structure only at daily (ma7_1d/ma25_1d/ma99_1d, atr_1d, volume_z_1d,
-- structure_1d). This migration adds the same set of columns — minus the
-- daily-only pct_from_ma* trio, which AC 2.4's second bullet scopes to the
-- daily moving averages specifically — for 15m, 1h and 4h.
--
-- Idempotent: every column uses `add column if not exists`, and the new
-- structure CHECK constraints are added conditionally, matching the style of
-- 0001/0002 so this file can be re-run safely.

alter table public.snapshots
  add column if not exists ma7_15m       numeric,
  add column if not exists ma25_15m      numeric,
  add column if not exists ma99_15m      numeric,
  add column if not exists atr_15m       double precision,
  add column if not exists volume_z_15m  double precision,
  add column if not exists structure_15m text,

  add column if not exists ma7_1h        numeric,
  add column if not exists ma25_1h       numeric,
  add column if not exists ma99_1h       numeric,
  add column if not exists atr_1h        double precision,
  add column if not exists volume_z_1h   double precision,
  add column if not exists structure_1h  text,

  add column if not exists ma7_4h        numeric,
  add column if not exists ma25_4h       numeric,
  add column if not exists ma99_4h       numeric,
  add column if not exists atr_4h        double precision,
  add column if not exists volume_z_4h   double precision,
  add column if not exists structure_4h  text;

comment on column public.snapshots.ma7_15m is 'AC 2.4: 7-period SMA on the 15m timeframe, mirroring ma7_1d.';
comment on column public.snapshots.ma7_1h is 'AC 2.4: 7-period SMA on the 1h timeframe, mirroring ma7_1d.';
comment on column public.snapshots.ma7_4h is 'AC 2.4: 7-period SMA on the 4h timeframe, mirroring ma7_1d.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.snapshots'::regclass
      and conname  = 'snapshots_structure_15m_check'
  ) then
    alter table public.snapshots
      add constraint snapshots_structure_15m_check
      check (structure_15m is null or structure_15m in ('HH-HL', 'LH-LL', 'RANGE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.snapshots'::regclass
      and conname  = 'snapshots_structure_1h_check'
  ) then
    alter table public.snapshots
      add constraint snapshots_structure_1h_check
      check (structure_1h is null or structure_1h in ('HH-HL', 'LH-LL', 'RANGE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.snapshots'::regclass
      and conname  = 'snapshots_structure_4h_check'
  ) then
    alter table public.snapshots
      add constraint snapshots_structure_4h_check
      check (structure_4h is null or structure_4h in ('HH-HL', 'LH-LL', 'RANGE'));
  end if;
end $$;
