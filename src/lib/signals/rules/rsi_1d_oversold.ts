import { RSI_OVERSOLD, RSI_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'rsi_1d_oversold';

/** Daily RSI has crossed into oversold territory (<= 30). Bullish. */
export const rsi1dOversold: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const rsi = snapshot.rsi1d;
    if (rsi == null) {
      return null;
    }
    if (rsi > RSI_OVERSOLD) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'BULLISH',
      title: 'Daily RSI oversold',
      body: `Daily RSI at ${rsi.toFixed(0)} — selling exhausted, bounce increasingly likely.`,
      source: 'RSI 1d',
      severity: severityFromDistance(RSI_OVERSOLD - rsi, RSI_SEVERITY_SPAN),
    };
  },
};
