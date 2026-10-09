import { PRICE_VELOCITY_PCT, PRICE_VELOCITY_SEVERITY_SPAN } from '@/consts/signals';

import { priceChange1hPct } from '../gap';
import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'price_velocity';

/** Price moved beyond +-3% over the last hour. Tagged by direction. */
export const priceVelocity: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    const pricePct = priceChange1hPct(snapshot, previous);
    if (pricePct == null) {
      return null;
    }
    const magnitude = Math.abs(pricePct);
    if (magnitude < PRICE_VELOCITY_PCT) {
      return null;
    }
    const up = pricePct > 0;

    return {
      ruleId: RULE_ID,
      tag: up ? 'BULLISH' : 'BEARISH',
      title: up ? 'Price surging in one hour' : 'Price dropping fast in one hour',
      body: `Price ${up ? '+' : ''}${pricePct.toFixed(1)}% over the last hour.`,
      source: 'Price',
      severity: severityFromDistance(magnitude - PRICE_VELOCITY_PCT, PRICE_VELOCITY_SEVERITY_SPAN),
    };
  },
};
