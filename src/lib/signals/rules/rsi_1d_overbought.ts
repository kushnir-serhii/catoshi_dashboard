import { RSI_OVERBOUGHT, RSI_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'rsi_1d_overbought';

/** Daily RSI has crossed into overbought territory (>= 70). Bearish. */
export const rsi1dOverbought: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const rsi = snapshot.rsi1d;
    if (rsi == null) {
      return null;
    }
    if (rsi < RSI_OVERBOUGHT) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'BEARISH',
      title: 'Daily RSI overbought',
      body: `Daily RSI at ${rsi.toFixed(0)} — momentum stretched, pullback risk rising.`,
      source: 'RSI 1d',
      severity: severityFromDistance(rsi - RSI_OVERBOUGHT, RSI_SEVERITY_SPAN),
    };
  },
};
