import { MACRO_RULE_SERIES } from '@/consts/macro';
import type { SourceStatus } from '@/data/types';
import { query } from '@/lib/db/client';
import { loadLatestMacroReadings } from '@/lib/db/macro';

import { clamp01 } from '../severity';
import { MACRO_RULES } from './index';
import type { MacroSignal } from './types';

/**
 * Macro signal writer (spec 027 slice 3). Runs on EVERY collect run, not behind
 * the 6h FRED fetch gate: it re-asserts cards from the stored readings, so a FRED
 * outage just means the rules keep seeing old readings and age out by
 * `MACRO_MAX_AGE_DAYS` (functional-spec 2.4: an outage nulls the macro rules only).
 *
 * Row shape: kind 'macro', asset_id NULL, snapshot_ts = run time, since_ts = the
 * latest observation date at 00:00Z. Idempotent on `(rule_id, snapshot_ts)` via
 * the partial unique index `signals_macro_rule_ts_uniq` (migration 0016).
 *
 * Failure isolation mirrors `generateSignals`: a throwing rule or a failed upsert
 * becomes a failed `signals:<ruleId>` status and never propagates. A failed
 * readings LOAD throws to the caller, as the market-state loaders do.
 */

export interface MacroGenerationResult {
  written: number;
  sources: SourceStatus[];
}

export async function generateMacroSignals(now: Date = new Date()): Promise<MacroGenerationResult> {
  const sources: SourceStatus[] = [];
  const series = [...new Set(Object.values(MACRO_RULE_SERIES))];
  const readings = await loadLatestMacroReadings(series, 2);

  let written = 0;
  for (const { ruleId, run } of MACRO_RULES) {
    let signal: MacroSignal | null;
    try {
      signal = run(readings[MACRO_RULE_SERIES[ruleId]] ?? [], now);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[signals] macro rule "${ruleId}" threw:`, error);
      sources.push({ source: `signals:${ruleId}`, ok: false, error: message });
      continue;
    }
    if (!signal) continue;

    try {
      await query(
        `insert into public.signals
           (kind, asset_id, rule_id, snapshot_ts, since_ts, tag, title, body, source, severity)
         values ('macro', null, $1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (rule_id, snapshot_ts) where kind = 'macro'
         do update set since_ts = excluded.since_ts, tag = excluded.tag,
           title = excluded.title, body = excluded.body, source = excluded.source,
           severity = excluded.severity`,
        [
          signal.ruleId,
          now.toISOString(),
          signal.sinceTs,
          signal.tag,
          signal.title,
          signal.body,
          signal.source,
          clamp01(signal.severity),
        ],
      );
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[signals] macro upsert failed for rule "${ruleId}":`, error);
      sources.push({ source: `signals:${ruleId}`, ok: false, error: message });
    }
  }

  return { written, sources };
}
