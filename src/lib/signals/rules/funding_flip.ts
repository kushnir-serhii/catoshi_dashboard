import { FUNDING_FLIP_MIN_RATE, SEVERITY_FIXED_MID } from '@/consts/signals';

import type { RuleDefinition } from '../types';

const RULE_ID = 'funding_flip';

const toBps = (rate: number): string => (rate * 10_000).toFixed(1);

/**
 * The perpetual funding rate changed sign versus the previous snapshot. Tag
 * follows the new direction: positive funding => longs paying => BULLISH lean;
 * negative => BEARISH. No natural scale, so fixed mid severity.
 */
export const fundingFlip: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    if (previous == null) {
      return null;
    }
    const current = snapshot.fundingRate;
    const prior = previous.fundingRate;
    if (current == null || prior == null) {
      return null;
    }

    if (Math.sign(current) === Math.sign(prior)) {
      return null;
    }
    // A wobble across zero while both readings are within noise of it is not a
    // regime change.
    if (Math.abs(current) < FUNDING_FLIP_MIN_RATE && Math.abs(prior) < FUNDING_FLIP_MIN_RATE) {
      return null;
    }

    const nowLong = current > 0;
    return {
      ruleId: RULE_ID,
      tag: nowLong ? 'BULLISH' : 'BEARISH',
      title: `Funding flipped ${nowLong ? 'positive' : 'negative'}`,
      body: `Funding moved ${toBps(prior)} to ${toBps(current)} bps — perp traders switching ${nowLong ? 'long' : 'short'}.`,
      source: 'Funding',
      severity: SEVERITY_FIXED_MID,
    };
  },
};
