-- 0010_accounts.sql
-- Spec 022 — Accounts, Roles and a Per-Person Reforecast Allowance.
-- Technical spec §2.2 (users, forecast_usage) and §2.9 (app_settings).
--
-- One row per person who has ever signed in with Google, an append-only log of
-- forecasts each person actually produced, and a small key/value settings table
-- (holds the news-classification pause among other things).
--
-- No accounts / sessions / verification_token tables: the session cookie carries
-- public.users.id directly, so NextAuth's adapter tables are not needed.
--
-- House style follows 0001_analytics.sql: `public.` prefix, `generated always as
-- identity`, named constraints, idempotent (safe to re-run).

-- ---------------------------------------------------------------------------
-- 1. users — one row per person who has ever signed in
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id                bigint      generated always as identity primary key,
  google_sub        text        not null,
  email             text        not null,
  name              text,
  image_url         text,
  role              text        not null default 'user',
  allowance_reset_at timestamptz,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),

  constraint users_google_sub_key unique (google_sub),
  constraint users_role_check check (role in ('user', 'admin'))
);

comment on table public.users is
  'One row per person who has ever signed in (spec 022). id is the value the session cookie carries.';
comment on column public.users.google_sub is
  'Google''s stable subject claim — the join key on each sign-in.';
comment on column public.users.email is
  'From Google, refreshed on every sign-in.';
comment on column public.users.role is
  '''user'' or ''admin''. Admins can restore a person''s daily reforecast allowance.';
comment on column public.users.allowance_reset_at is
  'NULL unless an admin restored today''s allowance for this person.';
comment on column public.users.last_seen_at is
  'Updated on every sign-in.';

-- ---------------------------------------------------------------------------
-- 2. forecast_usage — append-only, one row per forecast actually produced
-- ---------------------------------------------------------------------------

create table if not exists public.forecast_usage (
  id             bigint      generated always as identity primary key,
  user_id        bigint      not null references public.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  forecast_as_of timestamptz
);

comment on table public.forecast_usage is
  'Append-only log: one row per forecast a person actually produced (spec 022). Drives the per-person daily allowance.';
comment on column public.forecast_usage.forecast_as_of is
  'as_of of the forecast this row records; nullable.';

-- Allowance check: count today''s rows for a user, newest first.
create index if not exists idx_forecast_usage_user_created
  on public.forecast_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. app_settings — small key/value store for admin-tunable settings
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key        text        primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by bigint      references public.users (id) on delete set null
);

comment on table public.app_settings is
  'Admin-tunable key/value settings (spec 022 §2.9), e.g. the news-classification pause.';
comment on column public.app_settings.updated_by is
  'The admin user who last wrote this setting; NULL if set by a system process.';
