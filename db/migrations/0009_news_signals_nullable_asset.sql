-- 0009_news_signals_nullable_asset.sql
-- Spec 015, Slice 5 — publishing market-scope news into public.signals.
--
-- 0004_signals.sql declared public.signals.asset_id NOT NULL: every market-state
-- signal is about exactly one tracked asset. A classified headline with
-- news_classifications.scope = 'market' (asset_id NULL) has no asset, so the
-- signal row published for it must carry asset_id NULL too.
--
-- Resolution, mirroring 0008's handling of rule_id/snapshot_ts/since_ts:
--   * public.signals.asset_id becomes NULLABLE.
--   * The market_state branch of signals_kind_shape_check gains
--     `asset_id IS NOT NULL`, so a market-state row still always names its asset
--     — the guarantee /api/signals' inner join to public.assets relies on is
--     preserved, just moved from a column constraint into the per-kind check.
--   * News rows may leave asset_id NULL (market scope) or set it (asset scope);
--     the existing news_classifications_scope_asset_check already enforces the
--     scope <-> asset_id correspondence upstream.
--
-- House style follows 0001_analytics.sql: `public.` prefix, named constraints,
-- safe to re-run (drop-if-exists before add).

alter table public.signals alter column asset_id drop not null;

alter table public.signals drop constraint if exists signals_kind_shape_check;
alter table public.signals add  constraint signals_kind_shape_check
  check (
    case kind
      when 'market_state' then
        asset_id is not null and rule_id is not null
        and snapshot_ts is not null and since_ts is not null
      when 'news' then
        news_item_id is not null and source_url is not null and expires_at is not null
      else false
    end
  );

comment on constraint signals_kind_shape_check on public.signals is
  'Per-kind shape: market_state rows carry asset_id + rule_id + snapshot_ts + since_ts; news rows carry news_item_id + source_url + expires_at (asset_id optional — NULL for market scope).';
