import { PULSE_MODEL_VERSION, PULSE_SCOPES } from '@/consts/pulse';
import type { PulseScope, SourceStatus } from '@/data/types';
import {
  insertPulse,
  loadCollectorStatuses,
  loadPulseInputs,
  toStoredDriver,
} from '@/lib/db/pulse';

import { computePulse, type PulseCollectorStatus, type PulseComputation } from './compute';

/**
 * Overlays this run's statuses on the stored ones: a current-run entry wins,
 * stored rows fill in sources this run did not touch (e.g. gated macro).
 * This run's statuses are persisted after the Pulse step, so stored alone lags a run.
 */
export function mergeStatuses(
  stored: readonly PulseCollectorStatus[],
  current: readonly PulseCollectorStatus[],
): PulseCollectorStatus[] {
  const bySource = new Map(stored.map((s) => [s.source, s.ok]));
  for (const s of current) bySource.set(s.source, s.ok);
  return [...bySource].map(([source, ok]) => ({ source, ok }));
}

/** A scope's fresh compute result with the id of the `market_pulse` row just stored. */
export interface FreshPulse {
  result: Extract<PulseComputation, { status: 'ok' }>;
  pulseId: number;
}

export type FreshPulseByScope = Partial<Record<PulseScope, FreshPulse>>;

/**
 * Pulse step of the collect run (spec 027 technical §1): computes and stores one
 * `market_pulse` row per scope from the live signals. `now` is the run's input
 * time and becomes `computed_at`. Each scope is isolated: one failing never stops
 * the others, and `fresh` carries each stored scope's compute result for the notifier. An `insufficient` computation stores nothing (the numeric columns
 * are NOT NULL; no fake zeros) and is reported through the status note.
 */
export async function runPulse(
  now: Date,
  currentStatuses: readonly PulseCollectorStatus[] = [],
): Promise<{ sources: SourceStatus[]; fresh: FreshPulseByScope }> {
  const sources: SourceStatus[] = [];
  const fresh: FreshPulseByScope = {};

  let statuses: PulseCollectorStatus[];
  try {
    statuses = mergeStatuses(await loadCollectorStatuses(), currentStatuses);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { sources: [{ source: 'pulse', ok: false, error: message }], fresh };
  }

  for (const scope of PULSE_SCOPES) {
    const source = `pulse:${scope}`;
    try {
      const rows = await loadPulseInputs(scope, now);
      const result = computePulse(scope, rows, statuses, now);
      if (result.status === 'insufficient') {
        sources.push({ source, ok: true, note: `insufficient inputs=${result.inputCount}` });
        continue;
      }
      const pulseId = await insertPulse({
        scope,
        computedAt: now,
        bull: result.bull,
        bear: result.bear,
        value: result.value,
        conflict: result.conflict,
        inputCount: result.inputCount,
        drivers: result.drivers.map(toStoredDriver),
        missing: result.missing,
        modelVersion: PULSE_MODEL_VERSION,
      });
      fresh[scope] = { result, pulseId };
      sources.push({ source, ok: true, note: `value=${result.value} inputs=${result.inputCount}` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pulse] ${scope} failed:`, error);
      sources.push({ source, ok: false, error: message });
    }
  }
  return { sources, fresh };
}
