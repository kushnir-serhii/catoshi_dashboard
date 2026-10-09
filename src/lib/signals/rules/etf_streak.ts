import {
  ETF_SINGLE_DAY_SEVERITY_SPAN,
  ETF_SINGLE_DAY_USD,
  ETF_STREAK_MIN_DAYS,
  ETF_STREAK_SEVERITY_SPAN,
} from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'etf_streak';

/**
 * Spot-ETF net flows either maintain a consistent sign for 3+ consecutive days,
 * or experience a single large flow event (≥$100M). `etfStreakDays` is an
 * unsigned count of consecutive same-sign days; direction comes from the sign
 * of the latest net flow. Tag follows that direction.
 */
export const etfStreak: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const streakDays = snapshot.etfStreakDays;
    const netFlowUsd = snapshot.etfNetFlowUsd;

    // Null discipline: return null if netFlowUsd is null or zero
    if (netFlowUsd == null || netFlowUsd === 0) {
      return null;
    }

    const inflow = netFlowUsd > 0;
    const absFlow = Math.abs(netFlowUsd);

    // Check both conditions: streak or single large day
    const hasStreak = streakDays != null && streakDays >= ETF_STREAK_MIN_DAYS;
    const hasLargeDay = absFlow >= ETF_SINGLE_DAY_USD;

    if (!hasStreak && !hasLargeDay) {
      return null;
    }

    // Format the flow in millions once, reuse throughout
    const flowMM = (absFlow / 1e6).toFixed(absFlow % 1e6 === 0 ? 0 : 1);

    // Calculate severities and text for applicable branches
    let severity = 0;
    let title = '';
    let body = '';

    // Helper to compute single-day severity (distance and span both in USD)
    const singleDaySeverity = (): number =>
      severityFromDistance(absFlow - ETF_SINGLE_DAY_USD, ETF_SINGLE_DAY_SEVERITY_SPAN);

    if (hasStreak) {
      // Streak is primary wording
      severity = severityFromDistance(streakDays - ETF_STREAK_MIN_DAYS, ETF_STREAK_SEVERITY_SPAN);
      title = `ETF ${inflow ? 'inflows' : 'outflows'} ${streakDays} days running`;
      body = `Spot-ETF net flow ${inflow ? 'positive' : 'negative'} ${streakDays} days straight — sustained institutional ${inflow ? 'demand' : 'selling'}.`;

      // If also has large day, update body to include $ figure
      if (hasLargeDay) {
        body = `${inflow ? '+' : '−'}$${flowMM}M in net flow, ${streakDays} days running.`;
        severity = Math.max(severity, singleDaySeverity());
      }
    } else {
      // Single large day only (no streak)
      title = `ETF net ${inflow ? 'inflow' : 'outflow'} $${flowMM}M in a day`;
      body = `Spot-ETF net ${inflow ? 'inflow' : 'outflow'} of $${flowMM}M in one day, a large institutional move.`;
      severity = singleDaySeverity();
    }

    return {
      ruleId: RULE_ID,
      tag: inflow ? 'BULLISH' : 'BEARISH',
      title,
      body,
      source: 'ETF flows',
      severity,
    };
  },
};
