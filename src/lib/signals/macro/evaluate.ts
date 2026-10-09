import {
  MACRO_MAX_AGE_DAYS,
  MACRO_RULE_SERIES,
  MACRO_SEVERITY_SPAN,
  MACRO_THRESHOLDS,
  type MacroRuleId,
} from '@/consts/macro';

import { severityFromDistance } from '../severity';
import type { MacroReading, MacroSignal } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Display text that differs per rule; everything else comes from the constants. */
export interface MacroRuleLabels {
  /** Short name used in the title and body, e.g. `Brent crude`. */
  name: string;
  /** Formats the latest value for the body, e.g. `$84.20` or `4.31%`. */
  formatValue: (value: number) => string;
  /** Why a rise matters, <= ~6 words, e.g. `oil costs pressure risk assets`. */
  risingNote: string;
  /** Why a fall matters. */
  fallingNote: string;
  /** Source shown on the card. */
  source: string;
}

/** Rounds away float noise so a change exactly at the threshold fires (`>=`). */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Shared evaluation for the three macro rules (spec 027 technical 4.2). Each
 * rule file supplies its id and labels; the maths and null discipline live here.
 */
export function evaluateMacro(
  ruleId: MacroRuleId,
  labels: MacroRuleLabels,
  readings: readonly MacroReading[],
  now: Date,
): MacroSignal | null {
  if (readings.length < 2) return null;
  const [latest, prior] = readings;
  if (!Number.isFinite(latest.value) || !Number.isFinite(prior.value)) return null;

  const sinceMs = Date.parse(`${latest.obsDate}T00:00:00Z`);
  if (!Number.isFinite(sinceMs)) return null;

  const series = MACRO_RULE_SERIES[ruleId];
  if (now.getTime() - sinceMs > MACRO_MAX_AGE_DAYS[series] * DAY_MS) return null;

  const threshold = MACRO_THRESHOLDS[series];
  // DGS10 is quoted in percent, so a basis-point change is the difference * 100.
  const change = round6(
    threshold.kind === 'bp'
      ? (latest.value - prior.value) * 100
      : ((latest.value - prior.value) / prior.value) * 100,
  );
  if (!Number.isFinite(change)) return null;

  const magnitude = Math.abs(change);
  if (magnitude < threshold.value) return null;

  const rising = change > 0;
  const amount =
    threshold.kind === 'bp' ? `${magnitude.toFixed(0)} bp` : `${magnitude.toFixed(1)}%`;
  const signedAmount = `${rising ? '+' : '−'}${amount}`;
  const asOf = latest.obsDate.slice(5); // MM-DD

  return {
    ruleId,
    // Rising is bearish for crypto, falling bullish (functional-spec 2.4).
    tag: rising ? 'BEARISH' : 'BULLISH',
    title: `${labels.name} ${rising ? 'up' : 'down'} ${amount}`,
    body: `${labels.name} ${signedAmount} to ${labels.formatValue(latest.value)} as of ${asOf}; ${
      rising ? labels.risingNote : labels.fallingNote
    }.`,
    source: labels.source,
    severity: severityFromDistance(magnitude - threshold.value, MACRO_SEVERITY_SPAN[series]),
    sinceTs: new Date(sinceMs).toISOString(),
  };
}
