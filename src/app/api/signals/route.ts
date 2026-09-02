import { NextResponse } from 'next/server';

import { NEWS_PROMPT_VERSION } from '@/consts/news';
import {
  SIGNALS_COLLECTION_INTERVAL_MS,
  SIGNALS_COUNT,
  SIGNALS_FRESHNESS_HOURS,
} from '@/consts/signals';
import { mockSignalsResponse } from '@/data/signals';
import type { NewsScope, NewsSignalItem, SignalItem, SignalsResponse } from '@/data/types';
import { query } from '@/lib/db/client';

// Collection runs hourly and the client polls every minute — a static cache
// would hide a fresh signal for hours. Never cache this route.
export const dynamic = 'force-dynamic';

interface SignalRow {
  // `public.signals.id` is `bigint generated always as identity`; node-postgres
  // returns bigint as a string, so this is honest, not a placeholder.
  id: string;
  tag: SignalItem['tag'];
  title: string;
  body: string;
  source: string;
  snapshot_ts: string;
  since_ts: string;
  // Joined from `public.assets.symbol` — a signal row references a single asset.
  symbol: string;
}

interface NewsSignalRow {
  id: string;
  tag: NewsSignalItem['tag'];
  title: string;
  body: string;
  source: string;
  source_url: string;
  published_at: string;
  expires_at: string;
  severity: number;
  scope: string;
  magnitude: NewsSignalItem['magnitude'];
  horizon_hours: number;
  confidence: number;
}

interface SnapshotTsRow {
  ts: string;
}

const ASSET_SCOPES: readonly NewsScope[] = ['BTC', 'ETH', 'SOL'];

/**
 * The optional `?scope=` filter. Three shapes, chosen so the UI control reads
 * as "all / market-wide / one asset" coherently across BOTH signal kinds:
 *
 *   - (no scope)  → every market-state signal + every live news signal.
 *   - scope=market → every market-state signal (they are all asset-tied and
 *     provide context) + ONLY market-wide news (asset_id IS NULL). No per-asset
 *     news, since "market-wide" is about the broad-market story.
 *   - scope=BTC|ETH|SOL → market-state signals for THAT asset only + news
 *     scoped to that asset only. No market-wide news — "one asset" narrows the
 *     whole feed, rules and headlines alike, to that asset's story
 *     (functional-spec 2.3: "filtered to `market` scope or to a single asset").
 *
 * Unknown values are ignored (treated as no scope) rather than erroring — a
 * stale client must never see a 400 here.
 */
function parseScope(raw: string | null): 'market' | NewsScope | null {
  if (!raw) return null;
  if (raw === 'market') return 'market';
  const upper = raw.toUpperCase() as NewsScope;
  return ASSET_SCOPES.includes(upper) ? upper : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    // News never resurrects the mock path — the market-state mock behaviour is
    // exactly as it was, and no mock news is fabricated (functional-spec 2.5).
    return NextResponse.json(mockSignalsResponse);
  }

  const scope = parseScope(new URL(request.url).searchParams.get('scope'));
  const assetScope = scope && scope !== 'market' ? scope : null;

  try {
    // The newest snapshot is what actually backs the feed. Read it first so a
    // healthy-but-quiet feed (recent snapshot, no signals) can be told apart
    // from a broken one, and so `lastUpdated` reflects when data was produced
    // rather than when this request happened.
    const [snapshot] = await query<SnapshotTsRow>(
      'select ts from public.snapshots order by ts desc limit 1',
    );
    const newestSnapshotTs = snapshot ? new Date(snapshot.ts) : null;

    // Collapse the per-hour rows to one per (asset_id, rule_id) — a condition
    // that held for twenty hours is one card, not twenty (functional-spec 2.3).
    // `distinct on` keeps the newest row per condition inside the freshness
    // window; the outer query then orders by importance and caps the card count.
    // Explicit column list, not `select *`: a renamed column is a compile error
    // against SignalRow, not a runtime `undefined`.
    const marketStateRows = await query<SignalRow>(
      `select collapsed.id,
              collapsed.tag,
              collapsed.title,
              collapsed.body,
              collapsed.source,
              collapsed.snapshot_ts,
              collapsed.since_ts,
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
                  s.severity,
                  a.symbol
             from public.signals s
             join public.assets a on a.id = s.asset_id
            where s.kind = 'market_state'
              and s.snapshot_ts > now() - make_interval(hours => $1::int)
              and ($3::text is null or a.symbol = $3::text)
            order by s.asset_id, s.rule_id, s.snapshot_ts desc
         ) collapsed
        order by collapsed.severity desc, collapsed.snapshot_ts desc
        limit $2`,
      [SIGNALS_FRESHNESS_HOURS, SIGNALS_COUNT, assetScope],
    );

    // Live news rows: kind = 'news' AND not past expiry. Expired rows stay in
    // the table for scoring but never appear here. Reads stored rows only — no
    // computation, no external call (technical-considerations §2.5).
    //   - $1 market-only filter (scope=market)   → asset_id IS NULL
    //   - $2 asset filter (scope=BTC|ETH|SOL)    → a.symbol = $2
    //   - $3 current prompt version, for magnitude/horizon/confidence join
    const newsRows = await query<NewsSignalRow>(
      `select s.id,
              s.tag,
              s.title,
              s.body,
              s.source,
              s.source_url,
              ni.published_at,
              s.expires_at,
              s.severity,
              coalesce(a.symbol, 'market') as scope,
              nc.magnitude,
              nc.horizon_hours,
              nc.confidence
         from public.signals s
         join public.news_items ni on ni.id = s.news_item_id
         left join public.assets a on a.id = s.asset_id
         left join lateral (
           select magnitude, horizon_hours, confidence
             from public.news_classifications
            where news_item_id = s.news_item_id
            order by (prompt_version = $3) desc, created_at desc
            limit 1
         ) nc on true
        where s.kind = 'news'
          and s.expires_at > now()
          and ($1::boolean is not true or s.asset_id is null)
          and ($2::text is null or a.symbol = $2::text)
        order by s.severity desc, ni.published_at desc`,
      [scope === 'market', assetScope, NEWS_PROMPT_VERSION],
    );

    const signals: SignalItem[] = marketStateRows.map((row) => ({
      id: row.id,
      tag: row.tag,
      title: row.title,
      body: row.body,
      source: row.source,
      publishedAt: row.snapshot_ts,
      since: row.since_ts,
      // A signal row is about exactly one asset; `symbol` is constrained by the
      // seeded `public.assets` rows to the tracked-coin set.
      coins: [row.symbol] as SignalItem['coins'],
    }));

    const newsSignals: NewsSignalItem[] = newsRows.map((row) => ({
      id: row.id,
      kind: 'news',
      tag: row.tag,
      title: row.title,
      body: row.body,
      source: row.source,
      sourceUrl: row.source_url,
      publishedAt: new Date(row.published_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      scope: row.scope as NewsScope,
      magnitude: row.magnitude,
      severity: row.severity,
      horizonHours: row.horizon_hours,
      confidence: row.confidence,
    }));

    const response: SignalsResponse = {
      lastUpdated: newestSnapshotTs ? newestSnapshotTs.toISOString() : null,
      nextUpdate: newestSnapshotTs
        ? new Date(newestSnapshotTs.getTime() + SIGNALS_COLLECTION_INTERVAL_MS).toISOString()
        : null,
      collectionHealthy: newestSnapshotTs !== null,
      signals,
      newsSignals,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    // A dead database — or, until spec 014 slice 2, a `signals` table that does
    // not exist in Neon — must not silently look like a calm market. Report it
    // honestly so the UI can render an explicit "feed is broken" state.
    console.error('[signals] query failed:', error);

    const response: SignalsResponse = {
      lastUpdated: null,
      nextUpdate: null,
      fetchError: true,
      signals: [],
    };

    return NextResponse.json(response);
  }
}
