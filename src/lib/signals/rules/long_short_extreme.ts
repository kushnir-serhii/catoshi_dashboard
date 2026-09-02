import {
  LONG_SHORT_LONG_HEAVY,
  LONG_SHORT_SEVERITY_SPAN_LN,
  LONG_SHORT_SHORT_HEAVY,
} from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'long_short_extreme';

/**
 * The long/short account ratio is lopsided. Read contrarian: a crowd stacked on
 * one side is fuel for a squeeze against it, so heavily long is BEARISH.
 *
 * Severity is measured in log space, because the ratio is not symmetric on a
 * raw scale — it runs to infinity above 1 and is compressed into 0..1 below it.
 * Without logs a 4.0 long skew would always outrank its exact mirror at 0.25.
 */
export const longShortExtreme: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const ratio = snapshot.longShortRatio;
    if (ratio == null || ratio <= 0) {
      return null;
    }

    const longHeavy = ratio >= LONG_SHORT_LONG_HEAVY;
    const shortHeavy = ratio <= LONG_SHORT_SHORT_HEAVY;
    if (!longHeavy && !shortHeavy) {
      return null;
    }

    const threshold = longHeavy ? LONG_SHORT_LONG_HEAVY : LONG_SHORT_SHORT_HEAVY;
    const distanceLn = Math.abs(Math.log(ratio) - Math.log(threshold));

    return {
      ruleId: RULE_ID,
      tag: longHeavy ? 'BEARISH' : 'BULLISH',
      title: `Positioning heavily ${longHeavy ? 'long' : 'short'}`,
      body: `Long/short ratio at ${ratio.toFixed(2)} — one-sided crowd, vulnerable to a squeeze.`,
      source: 'Long/short',
      severity: severityFromDistance(distanceLn, LONG_SHORT_SEVERITY_SPAN_LN),
    };
  },
};
