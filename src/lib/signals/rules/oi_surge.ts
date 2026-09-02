import { OI_SURGE_CHANGE_PCT, OI_SURGE_PRICE_FLAT_PCT, OI_SURGE_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'oi_surge';

/**
 * Open interest jumped over 24h while price stayed roughly flat — fresh leverage
 * entering without a directional move yet, which tends to precede a volatile one.
 *
 * The 24h OI change is a genuine snapshot field; "price flat" is checked between
 * the previous and current snapshot (hourly cadence), the closest proxy the
 * store offers for the §4 table's 24h flatness.
 */
export const oiSurge: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    const oiChangePct = snapshot.openInterestChange24hPct;
    if (oiChangePct == null) {
      return null;
    }
    if (oiChangePct < OI_SURGE_CHANGE_PCT) {
      return null;
    }

    if (previous == null) {
      return null;
    }
    const priorPrice = previous.price;
    if (priorPrice == null || priorPrice === 0) {
      return null;
    }

    const pricePct = Math.abs(((snapshot.price - priorPrice) / priorPrice) * 100);
    if (pricePct > OI_SURGE_PRICE_FLAT_PCT) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'NEUTRAL',
      title: 'Open interest surging, price flat',
      body: `Open interest up ${oiChangePct.toFixed(0)}% in 24h with price near flat — leverage building.`,
      source: 'Open interest',
      severity: severityFromDistance(oiChangePct - OI_SURGE_CHANGE_PCT, OI_SURGE_SEVERITY_SPAN),
    };
  },
};
