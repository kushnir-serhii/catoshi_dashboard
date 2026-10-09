/**
 * Market Pulse API response builder (spec 027 technical §7). Pure: the route
 * loads the rows, this decides the status, so it is testable without a DB.
 *
 *   unavailable  no stored row and no insufficient note
 *   insufficient latest `pulse:<scope>` attempt says "insufficient inputs=N" and is
 *                newer than the latest stored row (or there is no row)
 *   stale        latest row older than PULSE_STALE_HOURS (no numbers)
 *   ok           everything else, full payload
 */

import { PULSE_MODEL_VERSION, PULSE_STALE_HOURS } from '@/consts/pulse';
import type { PulseDriver, PulseResponse, PulseScope } from '@/data/types';
import type { PulseAttemptStatus, PulseRow } from '@/lib/db/pulse';
import { buildPulseSummary } from '@/lib/pulse/summary';

const MS_PER_HOUR = 3_600_000;
const INSUFFICIENT_NOTE = /^insufficient inputs=(\d+)$/;

/** Input count from a `pulse:<scope>` note, or null when it is not an insufficient note. */
export function parseInsufficientNote(detail: string | null): number | null {
  const match = detail ? INSUFFICIENT_NOTE.exec(detail.trim()) : null;
  return match ? Number(match[1]) : null;
}

export function buildPulseResponse(
  latest: PulseRow | null,
  near24h: PulseRow | null,
  attempt: PulseAttemptStatus | null,
  now: Date,
  nextEvent: { ts: string; title: string } | null,
): PulseResponse {
  const insufficientCount = attempt ? parseInsufficientNote(attempt.detail) : null;
  if (
    attempt &&
    insufficientCount !== null &&
    (!latest || attempt.lastAttemptAt.getTime() > latest.computedAt.getTime())
  ) {
    return { status: 'insufficient', inputCount: insufficientCount };
  }

  if (!latest) return { status: 'unavailable' };

  if (now.getTime() - latest.computedAt.getTime() > PULSE_STALE_HOURS * MS_PER_HOUR) {
    return { status: 'stale', computedAt: latest.computedAt.toISOString() };
  }

  const drivers: PulseDriver[] = latest.drivers.map((d) => ({
    signalId: String(d.signal_id),
    label: d.label,
    display: d.display,
    sign: d.c >= 0 ? 1 : -1,
  }));

  return {
    status: 'ok',
    scope: latest.scope,
    computedAt: latest.computedAt.toISOString(),
    bull: latest.bull,
    bear: latest.bear,
    value: latest.value,
    conflict: latest.conflict,
    inputCount: latest.inputCount,
    drivers,
    summary: buildPulseSummary(drivers, latest.value, latest.conflict),
    missing: latest.missing,
    prev24h: near24h ? near24h.value : null,
    nextEvent,
    modelVersion: latest.modelVersion,
  };
}

/** Deterministic payload for `NEXT_PUBLIC_USE_MOCK_DATA=true`. */
export function mockPulseResponse(scope: PulseScope): PulseResponse {
  const drivers: PulseDriver[] = [
    { signalId: 'mock-1', label: 'ETF outflows', display: 'ETF outflows', sign: -1 },
    { signalId: 'mock-2', label: 'Coins leaving exchanges', display: 'Exchange outflows', sign: 1 },
  ];
  return {
    status: 'ok',
    scope,
    computedAt: '2026-01-01T12:00:00.000Z',
    bull: 20,
    bear: 38,
    value: -18,
    conflict: false,
    inputCount: 7,
    drivers,
    summary: buildPulseSummary(drivers, -18, false),
    missing: [],
    prev24h: -10,
    nextEvent: null,
    modelVersion: PULSE_MODEL_VERSION,
  };
}
