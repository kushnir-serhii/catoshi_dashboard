import { SENTIMENT_SWING_POINTS, SENTIMENT_SWING_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'sentiment_swing';

/**
 * Fear & Greed has moved a long way in a week. This is about the *change*, not
 * the level, so it complements `fear_greed_extreme` rather than repeating it: a
 * swing from 30 to 58 never touches either extreme but says the mood turned.
 *
 * Both readings come from the same snapshot (`fearGreed`, `fearGreed7dAgo`), so
 * no previous snapshot is needed.
 */
export const sentimentSwing: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const now = snapshot.fearGreed;
    const weekAgo = snapshot.fearGreed7dAgo;
    if (now == null || weekAgo == null) {
      return null;
    }

    const delta = now - weekAgo;
    if (Math.abs(delta) < SENTIMENT_SWING_POINTS) {
      return null;
    }

    const warming = delta > 0;
    return {
      ruleId: RULE_ID,
      tag: warming ? 'BULLISH' : 'BEARISH',
      title: `Sentiment swung ${warming ? 'up' : 'down'} sharply`,
      body: `Fear & Greed ${weekAgo.toFixed(0)} to ${now.toFixed(0)} in a week — mood turning ${warming ? 'greedy' : 'fearful'}.`,
      source: 'Fear & Greed',
      severity: severityFromDistance(
        Math.abs(delta) - SENTIMENT_SWING_POINTS,
        SENTIMENT_SWING_SEVERITY_SPAN,
      ),
    };
  },
};
