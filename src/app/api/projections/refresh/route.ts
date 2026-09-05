import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { ForecastTarget } from '@/consts/projections';
import {
  ADMIN_COOKIE_NAME,
  DEFAULT_FORECAST_MODEL,
  DEFAULT_FORECAST_SERVICE,
  DEFAULT_FORECAST_TARGETS,
  FORECAST_DAILY_CALL_LIMIT,
} from '@/consts/projections';
import type { ProjectionData, ProjectionsResponse } from '@/data/types';
import { matchesAdminSecret } from '@/lib/adminAuth';
import { getDailyForecastGenerationCount } from '@/lib/db/analytics';
import { buildMockProjectionForCoin, buildProjection, COIN_CONFIGS } from '@/lib/forecast/mock';
import { validateForecastParams } from '@/lib/forecast/params';
import { runForecast } from '@/lib/forecast/run';

const AUTH_PREFIX = 'Bearer ';

type AdminAuthResult = 'ok' | 'unauthorized' | 'unconfigured';

/**
 * Credential check for the admin-gated refresh route (spec 019, Slice 3,
 * technical-considerations §2.4). Accepts either an `Authorization: Bearer
 * <ADMIN_SECRET>` header or the `catoshi_admin` HttpOnly cookie (set later
 * by `GET /api/admin/unlock`), compared with `crypto.timingSafeEqual` the
 * same way `/api/collect`'s `CRON_SECRET` check does.
 *
 * Three-way result because this route has two distinct failure shapes:
 * an unset `ADMIN_SECRET` is a deploy misconfiguration (503, never open),
 * while a missing/wrong credential against a configured secret is a
 * rejected request (401).
 */
async function checkAdminAuth(request: Request): Promise<AdminAuthResult> {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return 'unconfigured';
  }

  const header = request.headers.get('authorization');
  if (header && header.startsWith(AUTH_PREFIX)) {
    const provided = header.slice(AUTH_PREFIX.length);
    if (matchesAdminSecret(expected, provided)) {
      return 'ok';
    }
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (cookieValue && matchesAdminSecret(expected, cookieValue)) {
    return 'ok';
  }

  return 'unauthorized';
}

interface RefreshRequestBody {
  service?: string;
  model?: string;
  /** When present, only this one coin is (re)forecasted instead of the
   * default tracked batch — used by the chart's and Scenario Simulator's
   * per-coin "Reforecast" actions, so switching to an arbitrary coin only
   * costs an AI call when the user actually asks for one. */
  coin?: { id?: string; symbol?: string; name?: string };
}

function isValidTarget(coin: RefreshRequestBody['coin']): coin is ForecastTarget {
  return (
    !!coin &&
    typeof coin.id === 'string' &&
    coin.id.length > 0 &&
    typeof coin.symbol === 'string' &&
    coin.symbol.length > 0 &&
    typeof coin.name === 'string' &&
    coin.name.length > 0
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await checkAdminAuth(request);
  if (authResult === 'unconfigured') {
    return NextResponse.json({ error: 'Admin unlock not configured' }, { status: 503 });
  }
  if (authResult === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mock mode makes no model call, so it must never be blocked by (or run)
  // the daily generation ceiling below — check it before the ceiling query,
  // not after, even though the mock branch itself sits later (after body
  // parsing) so it can honor `singleTarget`.
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

  if (!isMockMode) {
    const dailyCount = await getDailyForecastGenerationCount();
    if (dailyCount === null) {
      return NextResponse.json({ error: 'Unable to verify daily limit' }, { status: 503 });
    }
    if (dailyCount >= FORECAST_DAILY_CALL_LIMIT) {
      return NextResponse.json(
        {
          error: 'Daily generation limit reached',
          count: dailyCount,
          limit: FORECAST_DAILY_CALL_LIMIT,
        },
        { status: 429 },
      );
    }
  }

  let body: RefreshRequestBody = {};
  try {
    body = (await request.json()) as RefreshRequestBody;
  } catch {
    // body remains empty — use defaults
  }

  const { service, model } = validateForecastParams(
    body.service ?? DEFAULT_FORECAST_SERVICE,
    body.model ?? DEFAULT_FORECAST_MODEL,
  );

  const singleTarget: ForecastTarget | null = isValidTarget(body.coin)
    ? { id: body.coin.id, symbol: body.coin.symbol.toUpperCase(), name: body.coin.name }
    : null;

  // When mock data is enabled, return seeded mock data immediately. No
  // `revalidateTag` here: mock mode never persists a forecast, and `GET`'s
  // own mock branch (src/app/api/projections/route.ts) returns before it
  // ever reads the `unstable_cache`d entry this tag guards — so there is no
  // stored/cached forecast in mock mode for invalidation to affect either
  // way.
  if (isMockMode) {
    const projections: ProjectionData[] = singleTarget
      ? [buildMockProjectionForCoin(singleTarget)]
      : COIN_CONFIGS.map(buildProjection);
    const response: ProjectionsResponse = { projections, generatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  }

  const targets = singleTarget ? [singleTarget] : DEFAULT_FORECAST_TARGETS;

  try {
    const result = await runForecast({ targets, service, model, awaitPersist: true });

    // Invalidate only after generation succeeds (spec 019 AC 2.3): a failed
    // generation must leave the previous forecast intact, never an empty
    // cache with no fallback. `runForecast` throwing above skips straight to
    // the `catch` below, so this line is unreachable on failure.
    revalidateTag('projections', { expire: 0 });

    const response: ProjectionsResponse = {
      projections: result.projections,
      generatedAt: result.generatedAt,
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Forecast refresh failed' }, { status: 500 });
  }
}
