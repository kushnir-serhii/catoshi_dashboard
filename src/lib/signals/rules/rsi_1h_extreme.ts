import { RSI_1H_EXTREME_SEVERITY, RSI_1H_OVERBOUGHT, RSI_1H_OVERSOLD } from '@/consts/signals';

import type { RuleDefinition } from '../types';

const RULE_ID = 'rsi_1h_extreme';

/** Hourly RSI at an extreme: <= 25 is oversold (bullish), >= 75 overbought (bearish). Contrarian, LOW severity. */
export const rsi1hExtreme: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const rsi = snapshot.rsi1h;
    if (rsi == null) {
      return null;
    }
    if (rsi <= RSI_1H_OVERSOLD) {
      return {
        ruleId: RULE_ID,
        tag: 'BULLISH',
        title: 'Hourly RSI oversold',
        body: `Hourly RSI at ${rsi.toFixed(0)}: short-term selling stretched, bounce possible.`,
        source: 'RSI 1h',
        severity: RSI_1H_EXTREME_SEVERITY,
      };
    }
    if (rsi >= RSI_1H_OVERBOUGHT) {
      return {
        ruleId: RULE_ID,
        tag: 'BEARISH',
        title: 'Hourly RSI overbought',
        body: `Hourly RSI at ${rsi.toFixed(0)}: short-term buying stretched, pullback possible.`,
        source: 'RSI 1h',
        severity: RSI_1H_EXTREME_SEVERITY,
      };
    }
    return null;
  },
};
