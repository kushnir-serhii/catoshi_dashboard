import type { MarketSnapshot, SourceStatus } from '@/data/types';
import { getSnapshotBefore } from '@/lib/db/analytics';
import { query } from '@/lib/db/client';

import { RULES } from './rules';
import { clamp01 } from './severity';
import type { Signal } from './types';

/**
 * Signal generation for spec 014, Slice 4. Runs every deterministic rule in
 * `RULES` over a freshly committed snapshot and persists the ones that fired.
 *
 * Failure isolation (technical-considerations §5): each rule call is wrapped in
 * try/catch. A throwing rule is logged and reported as a failed `SourceStatus`
 * entry, and never propagates — snapshot data is unrecoverable if lost, signals
 * are trivially regenerable, so a bad rule must not fail the collection run.
 *
 * Ordering (technical-considerations §5): the caller (`/api/collect`) invokes
 * this only after `upsertSnapshot` has committed, so a signal can never
 * reference an uncommitted snapshot.
 */

/** Column order shared by the INSERT and its ON CONFLICT SET clause. */
const SIGNAL_COLUMNS = [
  'asset_id',
  'rule_id',
  'snapshot_ts',
  'since_ts',
  'tag',
  'title',
  'body',
  'source',
  'severity',
] as const;

export interface SignalGenerationResult {
  /** Number of signal rows upserted for this asset. */
  written: number;
  /** Per-rule / per-step status, merged into the collection run's source report. */
  sources: SourceStatus[];
}

/** Runs `rule` defensively; a throw becomes `[null, failedStatus]`. */
function runRule(
  ruleId: string,
  run: (s: MarketSnapshot, p: MarketSnapshot | null) => Signal | null,
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null,
): [Signal | null, SourceStatus | null] {
  try {
    return [run(snapshot, previous), null];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[signals] rule "${ruleId}" threw:`, error);
    return [null, { source: `signals:${ruleId}`, ok: false, error: message }];
  }
}

/**
 * Generates and persists signals for one asset's freshly written snapshot.
 *
 * @param snapshot the just-committed snapshot row (must carry a real `assetId`
 *   and `ts`).
 */
export async function generateSignals(snapshot: MarketSnapshot): Promise<SignalGenerationResult> {
  const sources: SourceStatus[] = [];

  // One fetch: feeds both the rules that compare against the prior hour and the
  // `since_ts` carry-forward lookup below.
  const previous = await getSnapshotBefore(snapshot.assetId, snapshot.ts);

  const fired: Signal[] = [];
  for (const { ruleId, run } of RULES) {
    const [signal, failure] = runRule(ruleId, run, snapshot, previous);
    if (failure) {
      sources.push(failure);
    }
    if (signal) {
      fired.push(signal);
    }
  }

  if (fired.length === 0) {
    return { written: 0, sources };
  }

  let written = 0;
  for (const signal of fired) {
    try {
      // since_ts carry-forward (technical-considerations §2): if the same
      // (asset_id, rule_id) fired at the previous collection hour, reuse its
      // since_ts; otherwise the condition starts now.
      let sinceTs = snapshot.ts;
      if (previous) {
        const prior = await query<{ since_ts: string }>(
          "select since_ts from public.signals where kind = 'market_state' and asset_id = $1 and rule_id = $2 and snapshot_ts = $3",
          [snapshot.assetId, signal.ruleId, previous.ts],
        );
        if (prior.length > 0) {
          sinceTs = prior[0].since_ts;
        }
      }

      const values = [
        snapshot.assetId,
        signal.ruleId,
        snapshot.ts,
        sinceTs,
        signal.tag,
        signal.title,
        signal.body,
        signal.source,
        clamp01(signal.severity),
      ];
      const placeholders = SIGNAL_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
      const updateSet = SIGNAL_COLUMNS.filter(
        (c) => c !== 'asset_id' && c !== 'rule_id' && c !== 'snapshot_ts',
      )
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');

      await query(
        `insert into public.signals (${SIGNAL_COLUMNS.join(', ')})
         values (${placeholders})
         on conflict on constraint signals_asset_rule_ts_key
         do update set ${updateSet}`,
        values,
      );
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[signals] upsert failed for rule "${signal.ruleId}":`, error);
      sources.push({ source: `signals:${signal.ruleId}`, ok: false, error: message });
    }
  }

  return { written, sources };
}
