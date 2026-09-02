import { ETF_STREAK_DAYS, ETF_STREAK_SEVERITY_SPAN } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'etf_streak';

/**
 * Spot-ETF net flows have run the same sign for five or more consecutive days.
 * `etfStreakDays` is an unsigned count; direction comes from the sign of the
 * latest day's net flow. Tag follows that direction.
 */
export const etfStreak: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const streakDays = snapshot.etfStreakDays;
    const netFlowUsd = snapshot.etfNetFlowUsd;
    if (streakDays == null || netFlowUsd == null) {
      return null;
    }
    if (streakDays < ETF_STREAK_DAYS) {
      return null;
    }
    if (netFlowUsd === 0) {
      return null;
    }

    const inflow = netFlowUsd > 0;
    return {
      ruleId: RULE_ID,
      tag: inflow ? 'BULLISH' : 'BEARISH',
      title: `ETF ${inflow ? 'inflows' : 'outflows'} ${streakDays} days running`,
      body: `Spot-ETF net flow ${inflow ? 'positive' : 'negative'} ${streakDays} days straight — sustained institutional ${inflow ? 'demand' : 'selling'}.`,
      source: 'ETF flows',
      severity: severityFromDistance(streakDays - ETF_STREAK_DAYS, ETF_STREAK_SEVERITY_SPAN),
    };
  },
};
