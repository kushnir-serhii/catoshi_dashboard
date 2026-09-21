import { NextResponse } from 'next/server';

import { TODAY_COLLECTOR_SOURCE } from '@/consts/today';
import type { TodayResponse } from '@/data/types';
import { fetchKlines } from '@/lib/collectors/binanceKlines';
import { persistCollectorStatus } from '@/lib/db/collectorStatus';
import { buildTodayResponse, fetchLiveSpot } from '@/lib/todayApi';
import { readTrack } from '@/lib/todayScoring';

/**
 * `GET /api/today?asset=<coingecko id>` — spec 024 §3. Thin wrapper: the logic
 * lives in `src/lib/todayApi.ts`. Cached 60s via `revalidate`.
 */
export const revalidate = 60;

function mockResponse(asset: string): TodayResponse {
  return {
    status: 'ok',
    asset,
    spot: 100,
    spotTs: new Date(0).toISOString(),
    sigmaHourly: 0.005,
    k: 1,
    modelVersion: 0,
    lastBarTs: new Date(0).toISOString(),
    dayHighUtc: 101,
    dayLowUtc: 99,
    track: null,
  };
}

export async function GET(request: Request): Promise<NextResponse<TodayResponse>> {
  const asset = new URL(request.url).searchParams.get('asset')?.trim() ?? '';

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockResponse(asset));
  }

  const result = await buildTodayResponse(asset, {
    getKlines: (pair, limit) => fetchKlines(pair, '1h', limit),
    getSpot: fetchLiveSpot,
    getTrack: readTrack,
    now: Date.now(),
  });

  // Health (spec 024 Slice 2): recorded as a `collector_status` row so
  // `/api/health` lists it beside the other sources. Best-effort, never fails
  // the request. `untracked` is a caller error, not a source outage.
  if (!(result.status === 'unavailable' && result.reason === 'untracked')) {
    void persistCollectorStatus([
      {
        source: TODAY_COLLECTOR_SOURCE,
        ok: result.status === 'ok',
        error:
          result.status === 'ok'
            ? undefined
            : `${result.reason}${result.klinesFailure ? ` (${result.klinesFailure})` : ''}`,
      },
    ]);
  }

  return NextResponse.json(result);
}
