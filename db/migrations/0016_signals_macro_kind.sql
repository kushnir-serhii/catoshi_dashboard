-- 0016_signals_macro_kind.sql
-- Spec 027 (Market Pulse), Slice 3 — macro signals in public.signals.
--
-- A third signal kind, 'macro': FRED-driven rules (macro_brent, macro_10y,
-- macro_dollar) with scope `market`, so asset_id is NULL.
--
--   * signals_kind_check gains 'macro'.
--   * signals_kind_shape_check gains a 'macro' branch: asset_id NULL, and
--     rule_id / snapshot_ts / since_ts NOT NULL. since_ts is the FRED
--     OBSERVATION date (00:00Z), not when the condition was first seen: it
--     drives the card's "as of <date>" text and the Pulse's decay by
--     observation age. The market_state and news branches are unchanged.
--   * signals_asset_rule_ts_key (asset_id, rule_id, snapshot_ts) cannot dedupe
--     macro rows: NULLs are distinct in a unique constraint, so two writes of the
--     same (rule_id, snapshot_ts) with asset_id NULL would both succeed. A partial
--     unique index on (rule_id, snapshot_ts) where kind = 'macro' restores the
--     same idempotency market-state rows get from the constraint.
--
-- House style follows 0009: `public.` prefix, named constraints, safe to re-run.

alter table public.signals drop constraint if exists signals_kind_check;
alter table public.signals add  constraint signals_kind_check
  check (kind in ('market_state', 'news', 'macro'));

alter table public.signals drop constraint if exists signals_kind_shape_check;
alter table public.signals add  constraint signals_kind_shape_check
  check (
    case kind
      when 'market_state' then
        asset_id is not null and rule_id is not null
        and snapshot_ts is not null and since_ts is not null
      when 'news' then
        news_item_id is not null and source_url is not null and expires_at is not null
      when 'macro' then
        asset_id is null and rule_id is not null
        and snapshot_ts is not null and since_ts is not null
      else false
    end
  );

comment on constraint signals_kind_shape_check on public.signals is
  'Per-kind shape: market_state rows carry asset_id + rule_id + snapshot_ts + since_ts; news rows carry news_item_id + source_url + expires_at (asset_id optional); macro rows carry rule_id + snapshot_ts + since_ts (observation date) with asset_id NULL.';

create unique index if not exists signals_macro_rule_ts_uniq
  on public.signals (rule_id, snapshot_ts)
  where kind = 'macro';
