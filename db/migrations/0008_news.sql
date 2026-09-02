-- 0008_news.sql
-- Spec 015 — News Impact Classification. Slice 1: schema only, no model.
--
-- Adds the news ingest + classification tables and extends public.signals so a
-- classified headline can live in the same feed as a market-state rule firing.
--
-- House style follows 0001_analytics.sql: `public.` prefix, `generated always
-- as identity`, named constraints, idempotent (safe to re-run).
--
-- ---------------------------------------------------------------------------
-- Resolving the public.signals NOT NULL tension
-- ---------------------------------------------------------------------------
-- 0004_signals.sql declared EVERY column NOT NULL, with provenance carried by
-- (asset_id, rule_id, snapshot_ts) — the unique key and the since_ts
-- carry-forward key. A news signal has none of those: no rule, no snapshot, no
-- "condition first held at" moment. Its provenance is the article.
--
-- Chosen resolution:
--   * rule_id, snapshot_ts, since_ts become NULLABLE.
--   * A named CHECK (signals_kind_shape_check) enforces per-kind shape:
--       kind = 'market_state' -> rule_id, snapshot_ts, since_ts all NOT NULL
--       kind = 'news'         -> news_item_id, source_url, expires_at all NOT NULL
--   * The existing UNIQUE (asset_id, rule_id, snapshot_ts) — constraint
--     signals_asset_rule_ts_key — is LEFT UNTOUCHED. Market-state rows always
--     fill all three columns, so it keeps working exactly as before. News rows
--     leave rule_id/snapshot_ts NULL, and NULLs never collide in a Postgres
--     unique constraint, so news rows simply do not participate in it.
--   * A separate partial unique index (signals_news_item_uniq) gives news its
--     own idempotency key: one published signal per classified item.
--
-- since_ts carry-forward (src/lib/signals/generate.ts) is unaffected: it still
-- SELECTs by (asset_id, rule_id, snapshot_ts) and INSERTs market_state rows
-- with all three columns populated, so the new CHECK is satisfied by
-- construction. The read path in /api/signals gains an explicit
-- `kind = 'market_state'` filter in the same slice rather than inheriting it.

-- ---------------------------------------------------------------------------
-- 1. news_items — the raw article, one row per canonical URL, ever
-- ---------------------------------------------------------------------------

create table if not exists public.news_items (
  id            bigint      generated always as identity primary key,
  url_hash      text        not null,
  url           text        not null,
  title         text        not null,
  source        text        not null,
  feed_url      text        not null,
  published_at  timestamptz not null,
  ingested_at   timestamptz not null default now(),
  classified_at timestamptz,
  raw           jsonb       not null,

  constraint news_items_url_hash_key unique (url_hash)
);

comment on table public.news_items is
  'Raw ingested articles (spec 015). One row per canonical URL, ever. classified_at NULL = still in the classification work queue.';
comment on column public.news_items.url_hash is
  'sha256 hex of the normalised canonical URL. De-duplication key: two spellings of one article collapse to one row.';
comment on column public.news_items.published_at is
  'Article publication time from the feed — never ingest time. Drives ageing.';
comment on column public.news_items.classified_at is
  'Set once a classification row exists for this item. NULL = pending — this column is the work queue.';

-- Work-queue scan: oldest unclassified first.
create index if not exists news_items_unclassified_idx
  on public.news_items (published_at)
  where classified_at is null;

-- ---------------------------------------------------------------------------
-- 2. news_classifications — one row per classification that produced a result
-- ---------------------------------------------------------------------------

create table if not exists public.news_classifications (
  id             bigint           generated always as identity primary key,
  news_item_id   bigint           not null references public.news_items (id) on delete cascade,
  scope          text             not null,
  asset_id       bigint           references public.assets (id),
  direction      text             not null,
  magnitude      text             not null,
  horizon_hours  integer          not null,
  confidence     double precision not null,
  rationale      text             not null,
  model          text             not null,
  prompt_version text             not null,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(12, 6),
  created_at     timestamptz      not null default now(),

  constraint news_classifications_direction_check
    check (direction in ('BULLISH', 'BEARISH', 'NEUTRAL')),
  constraint news_classifications_magnitude_check
    check (magnitude in ('LOW', 'MEDIUM', 'HIGH')),
  constraint news_classifications_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint news_classifications_scope_asset_check
    check ((scope = 'market') = (asset_id is null))
);

comment on table public.news_classifications is
  'One row per classification that produced a result (spec 015). Re-classifying under a bumped prompt_version INSERTS a new row — the old assertion is never overwritten.';
comment on constraint news_classifications_scope_asset_check on public.news_classifications is
  'scope = ''market'' iff asset_id IS NULL. A single-asset scope must name the asset; a market-wide scope must not.';

-- One classification per (item, prompt_version): a given prompt version grades
-- an item once; a bumped version re-grades and inserts a fresh row.
create unique index if not exists news_classifications_item_prompt_uniq
  on public.news_classifications (news_item_id, prompt_version);

-- ---------------------------------------------------------------------------
-- 3. public.signals — extend for kind = 'news'
-- ---------------------------------------------------------------------------

alter table public.signals add column if not exists kind         text        not null default 'market_state';
alter table public.signals add column if not exists news_item_id bigint      references public.news_items (id) on delete cascade;
alter table public.signals add column if not exists source_url   text;
alter table public.signals add column if not exists expires_at   timestamptz;

-- Provenance columns are now kind-dependent (see header).
alter table public.signals alter column rule_id     drop not null;
alter table public.signals alter column snapshot_ts drop not null;
alter table public.signals alter column since_ts    drop not null;

alter table public.signals drop constraint if exists signals_kind_check;
alter table public.signals add  constraint signals_kind_check
  check (kind in ('market_state', 'news'));

alter table public.signals drop constraint if exists signals_kind_shape_check;
alter table public.signals add  constraint signals_kind_shape_check
  check (
    case kind
      when 'market_state' then rule_id is not null and snapshot_ts is not null and since_ts is not null
      when 'news'         then news_item_id is not null and source_url is not null and expires_at is not null
      else false
    end
  );

comment on column public.signals.kind is
  'market_state (spec 014, deterministic rule over a snapshot) or news (spec 015, LLM-classified headline). Default keeps every pre-spec-015 row correct.';
comment on column public.signals.expires_at is
  'News rows only: published_at + horizon_hours. Past this the row leaves the live feed but stays in the table for scoring.';
comment on constraint signals_kind_shape_check on public.signals is
  'Per-kind provenance: market_state rows carry rule_id/snapshot_ts/since_ts; news rows carry news_item_id/source_url/expires_at.';

-- News idempotency: one published signal per classified item. Publish (Slice 5)
-- is a plain upsert on this key. Market-state rows (news_item_id NULL) are
-- excluded and keep relying on signals_asset_rule_ts_key.
create unique index if not exists signals_news_item_uniq
  on public.signals (news_item_id)
  where kind = 'news';

-- Live-feed read path for news: not-yet-expired rows, newest expiry first.
create index if not exists signals_news_live_idx
  on public.signals (expires_at desc)
  where kind = 'news';
