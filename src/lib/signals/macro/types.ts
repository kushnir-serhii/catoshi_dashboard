import type { MacroRuleId } from '@/consts/macro';

import type { Signal } from '../types';

/** One stored FRED observation. `obsDate` is `YYYY-MM-DD`. */
export interface MacroReading {
  obsDate: string;
  value: number;
}

/**
 * What a macro rule returns. `sinceTs` is the latest observation date at 00:00Z
 * (ISO): the writer stores it as `signals.since_ts`, which drives "as of <date>"
 * and the Pulse's decay by observation age (spec 027 slice 3 decision).
 */
export interface MacroSignal extends Signal {
  sinceTs: string;
}

/**
 * A pure macro rule. `readings` are the latest observations of its series,
 * NEWEST FIRST; the rule uses the first two. Returns null on fewer than two
 * readings, a stale latest reading, or a non-finite value. No I/O.
 */
export type MacroRule = (readings: readonly MacroReading[], now: Date) => MacroSignal | null;

export interface MacroRuleDefinition {
  ruleId: MacroRuleId;
  run: MacroRule;
}
