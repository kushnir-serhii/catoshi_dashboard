import { MACRO_MAX_AGE_DAYS, MACRO_RULE_SERIES } from '@/consts/macro';
import { NEWS_PROMPT_VERSION } from '@/consts/news';
import { SIGNALS_FRESHNESS_HOURS } from '@/consts/signals';
import type { NewsScope, SignalItem } from '@/data/types';
import { query } from '@/lib/db/client';
import type { NewsSignalRow } from '@/lib/news/collapse';

/**
 * The one read definition of a "live" signal row (spec 027 technical §2.1),
 * shared by `/api/signals` and the Pulse loader so the two can never drift.
 */

export interface LiveSignalRow {
  // `public.signals.id` is `bigint generated always as identity`; node-postgres
  // returns bigint as a string, so this is honest, not a placeholder.
  id: string;
  tag: SignalItem['tag'];
  title: string;
  body: string;
  source: string;
  snapshot_ts: string;
  since_ts: string;
  rule_id: string;
  severity: number;
  // Joined from `public.assets.symbol`. NULL for `kind = 'macro'` rows (scope market).
  symbol: string | null;
  kind: 'market_state' | 'macro';
}

// Per-rule liveness for kind = 'macro' (spec 027 slice 3): a macro card lives as
// long as its observation is within MACRO_MAX_AGE_DAYS of its series, built from
// the constants so SQL carries no hardcoded numbers.
const macroRuleIds = Object.keys(MACRO_RULE_SERIES);
const macroMaxAgeDays = Object.values(MACRO_RULE_SERIES).map(
  (series) => MACRO_MAX_AGE_DAYS[series],
);

/**
 * Live market-state and macro rows, one per (asset_id, rule_id): the newest row
 * inside the freshness window. `assetScope` null returns every asset.
 */
export async function queryLiveMarketStateRows(
  assetScope: NewsScope | null,
): Promise<LiveSignalRow[]> {
  // Collapse the per-hour rows to one per (asset_id, rule_id) — a condition
  // that held for twenty hours is one card, not twenty (functional-spec 2.3).
  // `distinct on` keeps the newest row per condition inside the freshness
  // window; the outer query then orders newest-first (severity, then id, break
  // ties so the order is stable across refreshes). No row cap: every live row is
  // returned and the UI collapses the tail (spec 027 technical 4.3).
  // Explicit column list, not `select *`: a renamed column is a compile error
  // against LiveSignalRow, not a runtime `undefined`.
  return query<LiveSignalRow>(
    `select collapsed.id,
            collapsed.tag,
            collapsed.title,
            collapsed.body,
            collapsed.source,
            collapsed.snapshot_ts,
            collapsed.since_ts,
            collapsed.rule_id,
            collapsed.severity,
            collapsed.kind,
            collapsed.symbol
       from (
         select distinct on (s.asset_id, s.rule_id)
                s.id,
                s.tag,
                s.title,
                s.body,
                s.source,
                s.snapshot_ts,
                s.since_ts,
                s.rule_id,
                s.severity,
                s.kind,
                a.symbol
           from public.signals s
           left join public.assets a on a.id = s.asset_id
           left join unnest($3::text[], $4::int[]) as m(rule_id, max_age_days)
             on m.rule_id = s.rule_id
          where s.snapshot_ts > now() - make_interval(hours => $1::int)
            and ($2::text is null or a.symbol = $2::text)
            and (
              s.kind = 'market_state'
              or (
                s.kind = 'macro'
                and m.max_age_days is not null
                and s.since_ts > now() - make_interval(days => m.max_age_days)
              )
            )
          order by s.asset_id, s.rule_id, s.snapshot_ts desc
       ) collapsed
      order by collapsed.snapshot_ts desc, collapsed.severity desc, collapsed.id desc`,
    [SIGNALS_FRESHNESS_HOURS, assetScope, macroRuleIds, macroMaxAgeDays],
  );
}

/**
 * Live news rows: kind = 'news' AND not past expiry. Expired rows stay in the
 * table for scoring but never appear here. Reads stored rows only — no
 * computation, no external call (technical-considerations §2.5).
 *   - `marketOnly` (scope=market)   → asset_id IS NULL
 *   - `assetScope` (scope=BTC|ETH|SOL) → a.symbol = assetScope
 *   - prompt version fallback join to news_classifications for magnitude etc.
 */
export async function queryLiveNewsRows(
  marketOnly: boolean,
  assetScope: NewsScope | null,
): Promise<NewsSignalRow[]> {
  return query<NewsSignalRow>(
    `select s.id,
            s.tag,
            s.title,
            s.body,
            s.source,
            s.source_url,
            coalesce(ni.cluster_id, ni.id) as cluster_id,
            ni.published_at,
            s.expires_at,
            s.severity,
            coalesce(a.symbol, 'market') as scope,
            nc.magnitude,
            nc.horizon_hours,
            nc.confidence,
            nc.content_type
       from public.signals s
       join public.news_items ni on ni.id = s.news_item_id
       left join public.assets a on a.id = s.asset_id
       left join lateral (
         select magnitude, horizon_hours, confidence, content_type
           from public.news_classifications
          where news_item_id = s.news_item_id
          order by (prompt_version = $3) desc, created_at desc
          limit 1
       ) nc on true
      where s.kind = 'news'
        and s.expires_at > now()
        and ($1::boolean is not true or s.asset_id is null)
        and ($2::text is null or a.symbol = $2::text)
      order by ni.published_at desc, s.severity desc, s.id desc`,
    [marketOnly, assetScope, NEWS_PROMPT_VERSION],
  );
}
