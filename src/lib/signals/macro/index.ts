import { macro10y } from './macro_10y';
import { macroBrent } from './macro_brent';
import { macroDollar } from './macro_dollar';
import type { MacroRuleDefinition } from './types';

/**
 * The macro rules (spec 027 slice 3). Kept apart from `RULES`: those take a
 * market snapshot, these take stored FRED readings, so the signatures differ.
 */
export const MACRO_RULES: readonly MacroRuleDefinition[] = [macroBrent, macro10y, macroDollar];
