import { evaluateMacro } from './evaluate';
import type { MacroRuleDefinition } from './types';

const RULE_ID = 'macro_10y';

/** US 10Y Treasury yield (FRED DGS10) moves >= 8 bp between observations; rising is bearish. */
export const macro10y: MacroRuleDefinition = {
  ruleId: RULE_ID,
  run: (readings, now) =>
    evaluateMacro(
      RULE_ID,
      {
        name: '10Y yield',
        formatValue: (v) => `${v.toFixed(2)}%`,
        risingNote: 'higher yields weigh on crypto',
        fallingNote: 'lower yields support crypto',
        source: 'FRED',
      },
      readings,
      now,
    ),
};
