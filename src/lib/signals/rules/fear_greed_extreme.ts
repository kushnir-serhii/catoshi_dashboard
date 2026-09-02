import { FEAR_GREED_FEAR, FEAR_GREED_GREED, FEAR_GREED_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'fear_greed_extreme';

/**
 * The Fear & Greed index is at an extreme — <= 20 (extreme fear) or >= 80
 * (extreme greed). Read contrarian: extreme fear is a BULLISH fade, extreme
 * greed a BEARISH one.
 */
export const fearGreedExtreme: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const index = snapshot.fearGreed;
    if (index == null) {
      return null;
    }

    if (index <= FEAR_GREED_FEAR) {
      return {
        ruleId: RULE_ID,
        tag: 'BULLISH',
        title: 'Sentiment at extreme fear',
        body: `Fear & Greed at ${index.toFixed(0)} — extreme fear, crowd capitulation often marks a low.`,
        source: 'Fear & Greed',
        severity: severityFromDistance(FEAR_GREED_FEAR - index, FEAR_GREED_SEVERITY_SPAN),
      };
    }

    if (index >= FEAR_GREED_GREED) {
      return {
        ruleId: RULE_ID,
        tag: 'BEARISH',
        title: 'Sentiment at extreme greed',
        body: `Fear & Greed at ${index.toFixed(0)} — extreme greed, euphoria often precedes a pullback.`,
        source: 'Fear & Greed',
        severity: severityFromDistance(index - FEAR_GREED_GREED, FEAR_GREED_SEVERITY_SPAN),
      };
    }

    return null;
  },
};
