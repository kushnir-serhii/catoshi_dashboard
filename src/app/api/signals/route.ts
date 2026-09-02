import { NextResponse } from 'next/server';

import {
  SIGNALS_COLLECTION_INTERVAL_MS,
  SIGNALS_COUNT,
  SIGNALS_FRESHNESS_HOURS,
} from '@/consts/signals';
import { mockSignalsResponse } from '@/data/signals';
import type { SignalItem, SignalsResponse } from '@/data/types';
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

interface SnapshotTsRow {
  ts: string;
}

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockSignalsResponse);
  }

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
    const rows = await query<SignalRow>(
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
            where s.snapshot_ts > now() - make_interval(hours => $1::int)
            order by s.asset_id, s.rule_id, s.snapshot_ts desc
         ) collapsed
        order by collapsed.severity desc, collapsed.snapshot_ts desc
        limit $2`,
      [SIGNALS_FRESHNESS_HOURS, SIGNALS_COUNT],
    );

    const signals: SignalItem[] = rows.map((row) => ({
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

    const response: SignalsResponse = {
      lastUpdated: newestSnapshotTs ? newestSnapshotTs.toISOString() : null,
      nextUpdate: newestSnapshotTs
        ? new Date(newestSnapshotTs.getTime() + SIGNALS_COLLECTION_INTERVAL_MS).toISOString()
        : null,
      collectionHealthy: newestSnapshotTs !== null,
      signals,
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
