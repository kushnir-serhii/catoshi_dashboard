import { SEVERITY_FIXED_MID } from '@/consts/signals';

import type { RuleDefinition } from '../types';

const RULE_ID = 'ma_cross_daily';

/**
 * The daily MA7 crossed the MA25 between the previous snapshot and this one —
 * the classic golden / death cross. Directional: MA7 moving above MA25 is
 * BULLISH, below is BEARISH.
 *
 * A cross is an event, not a level, so it has no natural scale and takes the
 * fixed mid severity. It fires at most once per crossing because the condition
 * is defined against the previous snapshot rather than the current spread.
 */
export const maCrossDaily: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    if (previous == null) {
      return null;
    }
    const ma7 = snapshot.ma7Daily;
    const ma25 = snapshot.ma25Daily;
    const priorMa7 = previous.ma7Daily;
    const priorMa25 = previous.ma25Daily;
    if (ma7 == null || ma25 == null || priorMa7 == null || priorMa25 == null) {
      return null;
    }

    const now = Math.sign(ma7 - ma25);
    const before = Math.sign(priorMa7 - priorMa25);
    // Equal signs mean no cross. A spread of exactly zero (sign 0) is treated as
    // "not yet crossed" on both sides, so the signal fires on the bar that
    // actually resolves the tie rather than twice around it.
    if (now === before || now === 0 || before === 0) {
      return null;
    }

    const bullish = now > 0;
    return {
      ruleId: RULE_ID,
      tag: bullish ? 'BULLISH' : 'BEARISH',
      title: `Daily MA7 crossed ${bullish ? 'above' : 'below'} MA25`,
      body: `MA7 ${ma7.toFixed(0)} crossed ${bullish ? 'above' : 'below'} MA25 ${ma25.toFixed(0)} — trend turning.`,
      source: 'MA 1d',
      severity: SEVERITY_FIXED_MID,
    };
  },
};
