import { RSI_MIDLINE, SEVERITY_FIXED_MID } from '@/consts/signals';

import type { RuleDefinition } from '../types';

const RULE_ID = 'rsi_divergence_4h_1d';

/**
 * 4h and daily RSI sit on opposite sides of the 50 midline — the timeframes
 * disagree on trend direction. No natural scale, so fixed mid severity.
 */
export const rsiDivergence4h1d: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const rsi4h = snapshot.rsi4h;
    const rsi1d = snapshot.rsi1d;
    if (rsi4h == null || rsi1d == null) {
      return null;
    }

    // Strictly opposite sides: a reading sitting exactly on 50 is on neither
    // side, so the product is 0 and the rule does not fire.
    if ((rsi4h - RSI_MIDLINE) * (rsi1d - RSI_MIDLINE) >= 0) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'NEUTRAL',
      title: '4h and daily RSI diverge',
      body: `4h RSI ${rsi4h.toFixed(0)}, daily ${rsi1d.toFixed(0)} — timeframes disagree on direction.`,
      source: 'RSI',
      severity: SEVERITY_FIXED_MID,
    };
  },
};
