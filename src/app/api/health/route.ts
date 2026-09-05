import { NextResponse } from 'next/server';

import { COLLECT_ASSETS, SNAPSHOT_STALE_MINUTES } from '@/consts/collect';
import { readHealthData } from '@/lib/db/health';
import {
  isNewsClassificationPaused,
  isSnapshotStale,
  newestTimestamp,
  snapshotAgeMinutes,
} from '@/lib/freshness';

/**
 * `GET /api/health` — spec 017, Slice 4.
 *
 * Read-only, unauthenticated, no secret in the response. For each tracked asset:
 * newest snapshot `ts`, its age in minutes, and the count of snapshots in the
 * last 24 hours. Plus, from `public.collector_status`, each collector's last
 * success / last error, and one overall `ok` boolean.
 *
 * Returns HTTP 503 when the newest snapshot across every asset is older than
 * `SNAPSHOT_STALE_MINUTES` (or there is no snapshot at all), so a free external
 * uptime checker can watch this one URL and be the whole alerting layer. 200
 * when fresh.
 *
 * Two things it must not do (functional-spec 2.3): expose a connection string,
 * credential or raw row — only counts and timestamps leave here; and hit an
 * external API — it is two indexed DB reads, kept cheap because Neon sleeps and
 * this gets polled.
 */
export const dynamic = 'force-dynamic';

const TRACKED_SYMBOLS = COLLECT_ASSETS.map((asset) => asset.symbol);

interface AssetHealthPayload {
  symbol: string;
  newestSnapshotTs: string | null;
  ageMinutes: number | null;
  snapshots24h: number;
  stale: boolean;
}

interface HealthPayload {
  ok: boolean;
  checkedAt: string;
  staleThresholdMinutes: number;
  newestSnapshotTs: string | null;
  newestSnapshotAgeMinutes: number | null;
  assets: AssetHealthPayload[];
  collectors: {
    source: string;
    lastSuccessAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
  }[];
  /**
   * Whether news classification (the one background model call, spec 019
   * Slice 4) is currently paused via `NEWS_CLASSIFY_ENABLED`. This is a
   * deliberate, expected state during testing — not an outage — so it is
   * reported alongside `ok` but never folds into the 200/503 decision, which
   * stays purely about snapshot staleness.
   */
  newsClassificationPaused: boolean;
}

function mockPayload(now: number): HealthPayload {
  const freshTs = new Date(now - 5 * 60_000).toISOString();
  return {
    ok: true,
    checkedAt: new Date(now).toISOString(),
    staleThresholdMinutes: SNAPSHOT_STALE_MINUTES,
    newestSnapshotTs: freshTs,
    newestSnapshotAgeMinutes: 5,
    assets: TRACKED_SYMBOLS.map((symbol) => ({
      symbol,
      newestSnapshotTs: freshTs,
      ageMinutes: 5,
      snapshots24h: 24,
      stale: false,
    })),
    collectors: [],
    // Mock mode never calls a model, so pausing has no meaning here.
    newsClassificationPaused: false,
  };
}

export async function GET(): Promise<NextResponse> {
  const now = Date.now();

  // Consistent with sibling routes (`/api/signals`, `/api/projections`): mock
  // mode returns a synthetic healthy payload and never touches the database.
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockPayload(now), { status: 200 });
  }

  try {
    const data = await readHealthData(TRACKED_SYMBOLS);

    const assets: AssetHealthPayload[] = data.assets.map((asset) => ({
      symbol: asset.symbol,
      newestSnapshotTs: asset.newestTs,
      ageMinutes: snapshotAgeMinutes(asset.newestTs, now),
      snapshots24h: asset.snapshots24h,
      stale: isSnapshotStale(asset.newestTs, now),
    }));

    const newestTs = newestTimestamp(assets.map((asset) => asset.newestSnapshotTs));
    const ok = !isSnapshotStale(newestTs, now);

    const payload: HealthPayload = {
      ok,
      checkedAt: new Date(now).toISOString(),
      staleThresholdMinutes: SNAPSHOT_STALE_MINUTES,
      newestSnapshotTs: newestTs,
      newestSnapshotAgeMinutes: snapshotAgeMinutes(newestTs, now),
      assets,
      collectors: data.collectors.map((collector) => ({
        source: collector.source,
        lastSuccessAt: collector.lastSuccessAt,
        lastAttemptAt: collector.lastAttemptAt,
        lastError: collector.lastError,
      })),
      newsClassificationPaused: isNewsClassificationPaused(),
    };

    return NextResponse.json(payload, { status: ok ? 200 : 503 });
  } catch (error: unknown) {
    // A dead database is itself an unhealthy pipeline — report 503 with no
    // detail that could leak connection information, not a 500 stack.
    console.error('[health] read failed:', error);
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date(now).toISOString(),
        staleThresholdMinutes: SNAPSHOT_STALE_MINUTES,
        newestSnapshotTs: null,
        newestSnapshotAgeMinutes: null,
        error: 'health read failed',
        assets: [],
        collectors: [],
        // Reading this doesn't touch the DB, so it's safe to compute even
        // though the health read itself just failed.
        newsClassificationPaused: isNewsClassificationPaused(),
      },
      { status: 503 },
    );
  }
}
