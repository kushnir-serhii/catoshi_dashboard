import { ATR_EXPANSION_PCT, ATR_EXPANSION_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'volatility_expansion';

/**
 * The daily ATR is a wide share of price — the market is covering a lot of
 * ground each day. Directionless, and deliberately so: wide ranges say position
 * sizing and stops need rethinking, not which way to lean.
 *
 * Complements `volume_spike`, which measures participation. A day can trade
 * heavy volume inside a tight range, or drift wide on thin books; these are
 * different facts and each is worth its own card.
 */
export const volatilityExpansion: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const atr = snapshot.atrDaily;
    if (atr == null) {
      return null;
    }
    if (snapshot.price <= 0) {
      return null;
    }

    const atrPct = (atr / snapshot.price) * 100;
    if (atrPct < ATR_EXPANSION_PCT) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'NEUTRAL',
      title: 'Daily range unusually wide',
      body: `Daily ATR at ${atrPct.toFixed(1)}% of price — wide swings, size and stops need room.`,
      source: 'ATR 1d',
      severity: severityFromDistance(atrPct - ATR_EXPANSION_PCT, ATR_EXPANSION_SEVERITY_SPAN),
    };
  },
};
