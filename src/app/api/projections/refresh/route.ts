import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { ROLE_USER } from '@/consts/auth';
import type { ForecastTarget } from '@/consts/projections';
import {
  DEFAULT_FORECAST_MODEL,
  DEFAULT_FORECAST_SERVICE,
  DEFAULT_FORECAST_TARGETS,
} from '@/consts/projections';
import type { ProjectionData, ProjectionsResponse } from '@/data/types';
import { nextResetAt, remainingAllowance } from '@/lib/auth/allowance';
import { requireUser } from '@/lib/auth/authorize';
import { readUsage, recordUsage } from '@/lib/db/allowance';
import { buildMockProjectionForCoin, buildProjection, COIN_CONFIGS } from '@/lib/forecast/mock';
import { validateForecastParams } from '@/lib/forecast/params';
import { runForecast } from '@/lib/forecast/run';

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

/**
 * `POST /api/projections/refresh` — produce a fresh forecast (spec 022 §2.6).
 *
 * Enforcement order matters: the spec forbids charging for a forecast that was
 * not produced, so the `forecast_usage` row is written only after a successful
 * generation, and awaited (a lost ledger write hands out a free forecast, which
 * is far better than charging for one the person never received).
 *
 *   1. `requireUser()`        — a guest gets 401 `signin-required`.
 *   2. Mock mode              — mock projections, no allowance read or write.
 *   3. role `user`            — read remaining: null ⇒ 503 (fail closed),
 *                               zero ⇒ 429 with `resetsAt`. Admins skip this.
 *   4. Run the generation.
 *   5. On success only        — `revalidateTag`, then awaited `recordUsage`
 *                               (failure logged, response still 200).
 *   6. Return projections + recomputed `remaining`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const now = new Date();

  const authResult = await requireUser();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: 'Sign in to reforecast', reason: authResult.reason },
      { status: authResult.status },
    );
  }
  const { user } = authResult;

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

  // Mock mode makes no model call and persists nothing, so it must never read
  // or spend the allowance — exactly as it bypassed the old ceiling.
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  if (isMockMode) {
    const projections: ProjectionData[] = singleTarget
      ? [buildMockProjectionForCoin(singleTarget)]
      : COIN_CONFIGS.map(buildProjection);
    const response: ProjectionsResponse = { projections, generatedAt: now.toISOString() };
    return NextResponse.json(response);
  }

  // Allowance gate — users only. An admin has no count and is never rate-limited.
  let usedCount = 0;
  const isUser = user.role === ROLE_USER;
  if (isUser) {
    const usage = await readUsage(user.id);
    if (usage === null) {
      // The DB read failed — fail closed rather than hand out a free forecast.
      return NextResponse.json(
        {
          error: 'Reforecast is temporarily unavailable — please try again',
          reason: 'db-unavailable',
        },
        { status: 503 },
      );
    }
    usedCount = usage.usedCount;
    if (remainingAllowance(usedCount, ROLE_USER) === 0) {
      return NextResponse.json(
        {
          error: "You've used all 3 forecasts today",
          reason: 'allowance-exhausted',
          remaining: 0,
          resetsAt: nextResetAt(now).toISOString(),
        },
        { status: 429 },
      );
    }
  }

  const targets = singleTarget ? [singleTarget] : DEFAULT_FORECAST_TARGETS;

  try {
    const result = await runForecast({ targets, service, model, awaitPersist: true });

    // Invalidate only after generation succeeds: a failed generation must leave
    // the previous forecast intact. `runForecast` throwing skips to `catch`.
    revalidateTag('projections', { expire: 0 });

    // Charge the person only for a forecast they actually received. Awaited, but
    // a failure is logged and the response still succeeds (spec 022 §2.6 step 5).
    const forecastAsOf = result.projections[0]?.generatedAt
      ? new Date(result.projections[0].generatedAt)
      : null;
    try {
      await recordUsage(user.id, forecastAsOf);
    } catch (usageError: unknown) {
      console.error('[refresh] recordUsage failed — forecast served, not charged:', usageError);
    }

    const remaining = isUser ? remainingAllowance(usedCount + 1, ROLE_USER) : null;

    const response: ProjectionsResponse & { remaining: number | null } = {
      projections: result.projections,
      generatedAt: result.generatedAt,
      remaining,
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Forecast refresh failed' }, { status: 500 });
  }
}
