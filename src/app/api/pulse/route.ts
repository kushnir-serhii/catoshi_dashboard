import { NextResponse } from 'next/server';

import { MACRO_CALENDAR_LOOKAHEAD_HOURS } from '@/consts/macro';
import { PULSE_PREV24H_TOLERANCE_HOURS, PULSE_SCOPES } from '@/consts/pulse';
import type { PulseResponse, PulseScope } from '@/data/types';
import { loadLatestPulse, loadPulseAttemptStatus, loadPulseNear } from '@/lib/db/pulse';
import { nextEvent } from '@/lib/macro/calendar';
import { buildPulseResponse, mockPulseResponse } from '@/lib/pulse/response';

// Collection runs hourly and the card polls; a static cache would pin old numbers.
export const dynamic = 'force-dynamic';

const MS_PER_HOUR = 3_600_000;

function parseScope(raw: string | null): PulseScope | null {
  return PULSE_SCOPES.find((scope) => scope === raw) ?? null;
}

/**
 * `GET /api/pulse?scope=market|BTC|ETH|SOL`. A missing or unknown scope is a 400:
 * the caller always names its scope, so there is no silent default.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const scope = parseScope(new URL(request.url).searchParams.get('scope'));
  if (!scope) {
    return NextResponse.json(
      { error: `scope must be one of: ${PULSE_SCOPES.join(', ')}` },
      { status: 400 },
    );
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockPulseResponse(scope));
  }

  try {
    const now = new Date();
    const [latest, attempt] = await Promise.all([
      loadLatestPulse(scope),
      loadPulseAttemptStatus(scope),
    ]);
    const near24h = latest
      ? await loadPulseNear(
          scope,
          new Date(latest.computedAt.getTime() - 24 * MS_PER_HOUR),
          PULSE_PREV24H_TOLERANCE_HOURS,
        )
      : null;
    const event = nextEvent(now, MACRO_CALENDAR_LOOKAHEAD_HOURS);
    const response = buildPulseResponse(
      latest,
      near24h,
      attempt,
      now,
      event ? { ts: event.ts, title: event.title } : null,
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('[pulse] query failed:', error);
    const response: PulseResponse = { status: 'unavailable' };
    return NextResponse.json(response);
  }
}
