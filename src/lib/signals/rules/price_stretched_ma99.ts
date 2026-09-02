import { MA99_STRETCH_PCT, MA99_STRETCH_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'price_stretched_ma99';

/**
 * Price sits far from its daily MA99 — the long-run mean. Stretched far above
 * it is BEARISH (mean-reversion risk), far below BULLISH.
 *
 * Distinct from the RSI rules: RSI measures the *pace* of recent moves and
 * resets quickly, while this measures accumulated distance and can stay true
 * for weeks. A market can be 40% above its MA99 with a perfectly ordinary RSI.
 */
export const priceStretchedMa99: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const distancePct = snapshot.pctFromMa99Daily;
    if (distancePct == null) {
      return null;
    }

    const magnitude = Math.abs(distancePct);
    if (magnitude < MA99_STRETCH_PCT) {
      return null;
    }

    const above = distancePct > 0;
    return {
      ruleId: RULE_ID,
      tag: above ? 'BEARISH' : 'BULLISH',
      title: `Price stretched far ${above ? 'above' : 'below'} MA99`,
      body: `Price ${magnitude.toFixed(0)}% ${above ? 'above' : 'below'} the daily MA99 — far from its long-run mean.`,
      source: 'MA99 1d',
      severity: severityFromDistance(magnitude - MA99_STRETCH_PCT, MA99_STRETCH_SEVERITY_SPAN),
    };
  },
};
