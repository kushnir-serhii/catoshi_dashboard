import { SEVERITY_FIXED_MID } from '@/consts/signals';

import type { RuleDefinition } from '../types';

const RULE_ID = 'structure_flip_daily';

/**
 * Daily market structure changed character between snapshots — a range broke
 * into a trend, or a trend gave up its higher lows. Tag follows the structure
 * it moved into; a move into RANGE is directionless.
 *
 * This is the one rule that reads price *shape* rather than a number, which is
 * why it can fire on days when every indicator threshold stays untouched.
 */
export const structureFlipDaily: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    if (previous == null) {
      return null;
    }
    const now = snapshot.structureDaily;
    const before = previous.structureDaily;
    if (now == null || before == null) {
      return null;
    }
    if (now === before) {
      return null;
    }

    const tag = now === 'HH-HL' ? 'BULLISH' : now === 'LH-LL' ? 'BEARISH' : 'NEUTRAL';
    const describe = (s: 'HH-HL' | 'LH-LL' | 'RANGE'): string =>
      s === 'HH-HL' ? 'higher highs' : s === 'LH-LL' ? 'lower highs' : 'a range';

    return {
      ruleId: RULE_ID,
      tag,
      title: `Daily structure turned to ${describe(now)}`,
      body: `Daily structure moved from ${describe(before)} to ${describe(now)} — 20-bar character changed.`,
      source: 'Structure 1d',
      severity: SEVERITY_FIXED_MID,
    };
  },
};
