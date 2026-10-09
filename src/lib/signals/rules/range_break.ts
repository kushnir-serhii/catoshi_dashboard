import {
  RANGE_BREAK_BUFFER_PCT,
  RANGE_BREAK_LOOKBACK_CANDLES,
  RANGE_BREAK_SEVERITY_SPAN,
} from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'range_break';

/**
 * The last closed 4h candle closed beyond the 14-day high/low (the 84 closed
 * candles before it) by a buffer. One closed candle, not two. Tagged by direction.
 */
export const rangeBreak: RuleDefinition = {
  ruleId: RULE_ID,
  run(_snapshot, _previous, ctx) {
    const candles = ctx.history4h;
    if (candles.length < RANGE_BREAK_LOOKBACK_CANDLES + 1) {
      return null;
    }
    const last = candles[candles.length - 1];
    const window = candles.slice(-(RANGE_BREAK_LOOKBACK_CANDLES + 1), -1);

    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (const candle of window) {
      if (candle.low < minLow) minLow = candle.low;
      if (candle.high > maxHigh) maxHigh = candle.high;
    }
    if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh) || !Number.isFinite(last.close)) {
      return null;
    }
    if (minLow <= 0 || maxHigh <= 0) {
      return null;
    }

    const lowEdge = minLow * (1 - RANGE_BREAK_BUFFER_PCT / 100);
    const highEdge = maxHigh * (1 + RANGE_BREAK_BUFFER_PCT / 100);

    if (last.close < lowEdge) {
      const beyondPct = ((minLow - last.close) / minLow) * 100;
      return {
        ruleId: RULE_ID,
        tag: 'BEARISH',
        title: 'Broke below 14-day range',
        body: `4h candle closed ${beyondPct.toFixed(1)}% under the 14-day low: range support lost.`,
        source: 'Price range',
        severity: severityFromDistance(
          beyondPct - RANGE_BREAK_BUFFER_PCT,
          RANGE_BREAK_SEVERITY_SPAN,
        ),
      };
    }
    if (last.close > highEdge) {
      const beyondPct = ((last.close - maxHigh) / maxHigh) * 100;
      return {
        ruleId: RULE_ID,
        tag: 'BULLISH',
        title: 'Broke above 14-day range',
        body: `4h candle closed ${beyondPct.toFixed(1)}% over the 14-day high: range resistance cleared.`,
        source: 'Price range',
        severity: severityFromDistance(
          beyondPct - RANGE_BREAK_BUFFER_PCT,
          RANGE_BREAK_SEVERITY_SPAN,
        ),
      };
    }
    return null;
  },
};
