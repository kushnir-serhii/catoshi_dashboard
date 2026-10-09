import { evaluateMacro } from './evaluate';
import type { MacroRuleDefinition } from './types';

const RULE_ID = 'macro_brent';

/** Brent crude (FRED DCOILBRENTEU) moves >= 3% between observations; rising is bearish. */
export const macroBrent: MacroRuleDefinition = {
  ruleId: RULE_ID,
  run: (readings, now) =>
    evaluateMacro(
      RULE_ID,
      {
        name: 'Brent crude',
        formatValue: (v) => `$${v.toFixed(2)}`,
        risingNote: 'costlier oil pressures risk assets',
        fallingNote: 'cheaper oil eases pressure on risk assets',
        source: 'FRED',
      },
      readings,
      now,
    ),
};
