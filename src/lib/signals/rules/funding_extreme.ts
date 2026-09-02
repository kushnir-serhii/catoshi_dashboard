import { FUNDING_EXTREME_RATE, FUNDING_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'funding_extreme';

const toBps = (rate: number): string => (rate * 10_000).toFixed(1);

/**
 * |funding rate| is above the extreme threshold — one side of the perp market
 * is paying heavily to hold its position. Read contrarian to that crowd:
 * strongly positive funding => over-long => BEARISH, and vice versa.
 */
export const fundingExtreme: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const funding = snapshot.fundingRate;
    if (funding == null) {
      return null;
    }

    const magnitude = Math.abs(funding);
    if (magnitude < FUNDING_EXTREME_RATE) {
      return null;
    }

    const crowdLong = funding > 0;
    return {
      ruleId: RULE_ID,
      tag: crowdLong ? 'BEARISH' : 'BULLISH',
      title: `Funding extreme ${crowdLong ? 'positive' : 'negative'}`,
      body: `Funding at ${toBps(funding)} bps — crowd heavily ${crowdLong ? 'long' : 'short'}, squeeze risk elevated.`,
      source: 'Funding',
      severity: severityFromDistance(magnitude - FUNDING_EXTREME_RATE, FUNDING_SEVERITY_SPAN),
    };
  },
};
