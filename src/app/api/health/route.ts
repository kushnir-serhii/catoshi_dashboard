import { NextResponse } from 'next/server';

import { COLLECT_ASSETS, SNAPSHOT_STALE_MINUTES } from '@/consts/collect';
import { FORECAST_INGEST_COMPONENT } from '@/consts/projections';
import { PULSE_SCOPES } from '@/consts/pulse';
import { readHealthData } from '@/lib/db/health';
import { loadLatestPulse, loadPulseAttemptStatus } from '@/lib/db/pulse';
import {
  type ForecastIngestState,
  forecastIngestState,
  isNewsClassificationPaused,
  isSnapshotStale,
  newestTimestamp,
  snapshotAgeMinutes,
} from '@/lib/freshness';
import { calendarAgeDays, calendarAgeWarning } from '@/lib/macro/calendar';
import { buildPulseResponse } from '@/lib/pulse/response';

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

/**
 * Build pulse health summary for one scope. Extracts status and computedAt
 * from buildPulseResponse, then calculates ageMinutes.
 */
function buildPulseHealthSummary(
  response: ReturnType<typeof buildPulseResponse>,
  now: number,
): PulseHealthSummary {
  const computedAt =
    response.status === 'ok' || response.status === 'stale' ? response.computedAt : null;
  const computedAtMs = computedAt ? new Date(computedAt).getTime() : null;
  const ageMinutes = computedAtMs ? Math.round((now - computedAtMs) / 60_000) : null;

  return {
    status: response.status,
    computedAt: computedAt ?? null,
    ageMinutes,
  };
}

interface AssetHealthPayload {
  symbol: string;
  newestSnapshotTs: string | null;
  ageMinutes: number | null;
  snapshots24h: number;
  stale: boolean;
}

interface PulseHealthSummary {
  status: 'ok' | 'stale' | 'insufficient' | 'unavailable';
  computedAt: string | null;
  ageMinutes: number | null;
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
  /**
   * The spec 020 scheduled forecast producer, as its own component (§2.5):
   * `healthy | late | failing | never-run`, the last accepted ingest and its
   * age, and the last rejection reason when the most recent attempt failed.
   * `late` is reached at `SCHEDULED_FORECAST_LATE_AFTER_SECONDS` — before the
   * 6-hour freshness window elapses and the paid fallback engages. Never folds
   * into the 200/503 decision, which stays about snapshot staleness.
   */
  forecastIngest: {
    state: ForecastIngestState;
    lastAcceptedAt: string | null;
    lastAcceptedAgeMinutes: number | null;
    lastRejectionReason: string | null;
  };
  /**
   * Macro calendar staleness check (spec 027, Slice 3 §5). Reports the age in
   * days of the hand-maintained `src/data/macro-calendar.json` file and whether
   * a warning should be issued (age >= 21 days). Does not affect the 200/503
   * decision, which stays about snapshot staleness.
   */
  macroCalendar: {
    ageDays: number;
    ageWarning: boolean;
  };
  /**
   * Market Pulse per-scope health (spec 027, Slice 4 §5). Reports the status
   * (ok | stale | insufficient | unavailable), last computation timestamp,
   * and age in minutes for each scope. Does not affect the 200/503 decision,
   * which stays about snapshot staleness.
   */
  pulse: Record<string, PulseHealthSummary>;
}

function mockPayload(now: number): HealthPayload {
  const freshTs = new Date(now - 5 * 60_000).toISOString();
  const pulse: Record<string, PulseHealthSummary> = {};
  for (const scope of PULSE_SCOPES) {
    pulse[scope] = {
      status: 'ok',
      computedAt: freshTs,
      ageMinutes: 5,
    };
  }
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
    forecastIngest: {
      state: 'healthy',
      lastAcceptedAt: freshTs,
      lastAcceptedAgeMinutes: 5,
      lastRejectionReason: null,
    },
    macroCalendar: {
      ageDays: calendarAgeDays(now),
      ageWarning: calendarAgeWarning(now),
    },
    pulse,
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

    // Build pulse health data for each scope in parallel
    const pulsePromises = PULSE_SCOPES.map(async (scope) => {
      const [latest, attempt] = await Promise.all([
        loadLatestPulse(scope),
        loadPulseAttemptStatus(scope),
      ]);
      const response = buildPulseResponse(latest, null, attempt, new Date(now), null);
      return [scope, buildPulseHealthSummary(response, now)] as const;
    });
    const pulseArray = await Promise.all(pulsePromises);
    const pulse: Record<string, PulseHealthSummary> = Object.fromEntries(pulseArray);

    const assets: AssetHealthPayload[] = data.assets.map((asset) => ({
      symbol: asset.symbol,
      newestSnapshotTs: asset.newestTs,
      ageMinutes: snapshotAgeMinutes(asset.newestTs, now),
      snapshots24h: asset.snapshots24h,
      stale: isSnapshotStale(asset.newestTs, now),
    }));

    const newestTs = newestTimestamp(assets.map((asset) => asset.newestSnapshotTs));
    const ok = !isSnapshotStale(newestTs, now);

    const ingestRow = data.collectors.find(
      (collector) => collector.source === FORECAST_INGEST_COMPONENT,
    );
    const forecastIngest = {
      state: forecastIngestState(ingestRow ?? null, now),
      lastAcceptedAt: ingestRow?.lastSuccessAt ?? null,
      lastAcceptedAgeMinutes: snapshotAgeMinutes(ingestRow?.lastSuccessAt ?? null, now),
      lastRejectionReason: ingestRow?.lastError ?? null,
    };

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
      forecastIngest,
      macroCalendar: {
        ageDays: calendarAgeDays(now),
        ageWarning: calendarAgeWarning(now),
      },
      pulse,
    };

    return NextResponse.json(payload, { status: ok ? 200 : 503 });
  } catch (error: unknown) {
    // A dead database is itself an unhealthy pipeline — report 503 with no
    // detail that could leak connection information, not a 500 stack.
    console.error('[health] read failed:', error);
    const pulse: Record<string, PulseHealthSummary> = {};
    for (const scope of PULSE_SCOPES) {
      pulse[scope] = {
        status: 'unavailable',
        computedAt: null,
        ageMinutes: null,
      };
    }
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
        forecastIngest: {
          state: forecastIngestState(null, now),
          lastAcceptedAt: null,
          lastAcceptedAgeMinutes: null,
          lastRejectionReason: null,
        },
        macroCalendar: {
          ageDays: calendarAgeDays(now),
          ageWarning: calendarAgeWarning(now),
        },
        pulse,
      },
      { status: 503 },
    );
  }
}
