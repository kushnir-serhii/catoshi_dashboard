import { evaluateMacro } from './evaluate';
import type { MacroRuleDefinition } from './types';

const RULE_ID = 'macro_dollar';

/** Broad US dollar index (FRED DTWEXBGS) moves >= 0.5% between observations; rising is bearish. */
export const macroDollar: MacroRuleDefinition = {
  ruleId: RULE_ID,
  run: (readings, now) =>
    evaluateMacro(
      RULE_ID,
      {
        name: 'US dollar index',
        formatValue: (v) => v.toFixed(2),
        risingNote: 'a stronger dollar weighs on crypto',
        fallingNote: 'a weaker dollar supports crypto',
        source: 'FRED',
      },
      readings,
      now,
    ),
};
