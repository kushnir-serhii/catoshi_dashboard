import { NextResponse } from 'next/server';

import { SIGNALS_COLLECTION_INTERVAL_MS } from '@/consts/signals';
import { mockSignalsResponse } from '@/data/signals';
import type { NewsScope, SignalItem, SignalsResponse } from '@/data/types';
import { query } from '@/lib/db/client';
import { queryLiveMarketStateRows, queryLiveNewsRows } from '@/lib/db/signals-live';
import { isNewsClassificationPaused } from '@/lib/freshness';
import { collapseClusters } from '@/lib/news/collapse';

// Collection runs hourly and the client polls every minute — a static cache
// would hide a fresh signal for hours. Never cache this route.
export const dynamic = 'force-dynamic';

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

    // Live-row read definitions live in `src/lib/db/signals-live.ts`, shared
    // with the Pulse loader. Market-state: one row per (asset_id, rule_id) in the
    // freshness window; news: unexpired rows, collapsed per cluster below.
    const marketStateRows = await queryLiveMarketStateRows(assetScope);
    const newsRows = await queryLiveNewsRows(scope === 'market', assetScope);

    const signals: SignalItem[] = marketStateRows.map((row) => ({
      id: row.id,
      tag: row.tag,
      title: row.title,
      body: row.body,
      source: row.source,
      publishedAt: row.snapshot_ts,
      since: row.since_ts,
      // A market-state row is about exactly one asset; `symbol` is constrained by the
      // seeded `public.assets` rows to the tracked-coin set.
      // Macro rows have no asset: an empty list reads as market-wide in the UI.
      coins: (row.symbol ? [row.symbol] : []) as SignalItem['coins'],
      kind: row.kind,
    }));

    const newsSignals = collapseClusters(newsRows);

    const response: SignalsResponse = {
      lastUpdated: newestSnapshotTs ? newestSnapshotTs.toISOString() : null,
      nextUpdate: newestSnapshotTs
        ? new Date(newestSnapshotTs.getTime() + SIGNALS_COLLECTION_INTERVAL_MS).toISOString()
        : null,
      collectionHealthy: newestSnapshotTs !== null,
      signals,
      newsSignals,
      newsClassificationPaused: isNewsClassificationPaused(),
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
      // A dead DB and a deliberate pause are different facts — this is a pure
      // env read with no DB dependency, so it stays reliable even here.
      newsClassificationPaused: isNewsClassificationPaused(),
    };

    return NextResponse.json(response);
  }
}
