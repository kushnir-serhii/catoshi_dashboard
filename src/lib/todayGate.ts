/**
 * Verdict gate for the Today card (spec 024 functional §0). Pure so it is
 * testable: nothing here reads env or globals.
 */

export type TodayVerdict = 'A' | 'B' | 'C' | null;

/** `hidden` renders nothing, `band` the range band only, `full` band + level input. */
export type TodayGateMode = 'hidden' | 'band' | 'full';

export interface TodayGate {
  mode: TodayGateMode;
  /** True when the card is visible only because of the dev preview flag. */
  isPreview: boolean;
}

export function resolveTodayGate(input: {
  verdict: TodayVerdict;
  /** `NEXT_PUBLIC_TODAY_GATE_PREVIEW === 'true'`. */
  preview: boolean;
  isProduction: boolean;
}): TodayGate {
  const { verdict, preview, isProduction } = input;
  if (verdict === 'A') return { mode: 'full', isPreview: false };
  if (verdict === 'B') return { mode: 'band', isPreview: false };
  if (verdict === 'C') return { mode: 'hidden', isPreview: false };
  // Verdict not recorded: nothing in production; local dev may preview (as 'A').
  if (preview && !isProduction) return { mode: 'full', isPreview: true };
  return { mode: 'hidden', isPreview: false };
}
