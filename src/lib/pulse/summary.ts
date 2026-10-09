/**
 * Market Pulse one-line summary (spec 027 technical §2.4, functional §2.1.5).
 * A template over the top bearish and bullish drivers, no LLM. Pure.
 *
 *   none          → "No directional pressure: live signals are neutral."
 *   one side      → "Bearish: ETH ETF outflows, Long crowding."
 *   both, leading → "Bearish: ETH ETF outflows, Brent up; counterweight: BTC leaving exchanges."
 *   both, Conflict→ "Conflicted: bears on ETF outflows; bulls on BTC leaving exchanges."
 *   both, value 0 → "Balanced: bears on …; bulls on …."
 *
 * One sentence, at most `PULSE_SUMMARY_MAX_CHARS`. Labels past
 * `PULSE_SUMMARY_LABEL_MAX_CHARS` are cut; when the line is still too long the
 * weakest labels are dropped, keeping at least one per side.
 */

import {
  PULSE_SUMMARY_LABEL_MAX_CHARS,
  PULSE_SUMMARY_MAX_CHARS,
  PULSE_SUMMARY_PER_SIDE,
} from '@/consts/pulse';
import type { PulseDriver } from '@/data/types';

export type PulseSummaryDriver = Pick<PulseDriver, 'label' | 'sign'>;

const NEUTRAL_SUMMARY = 'No directional pressure: live signals are neutral.';

function shorten(text: string, max: number): string {
  const clean = text.trim().replace(/[.\s]+$/, '');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function render(
  bears: readonly string[],
  bulls: readonly string[],
  value: number,
  conflict: boolean,
): string {
  const bearList = bears.join(', ');
  const bullList = bulls.join(', ');
  if (bulls.length === 0) return `Bearish: ${bearList}.`;
  if (bears.length === 0) return `Bullish: ${bullList}.`;
  if (conflict) return `Conflicted: bears on ${bearList}; bulls on ${bullList}.`;
  if (value < 0) return `Bearish: ${bearList}; counterweight: ${bullList}.`;
  if (value > 0) return `Bullish: ${bullList}; counterweight: ${bearList}.`;
  return `Balanced: bears on ${bearList}; bulls on ${bullList}.`;
}

/**
 * @param drivers ordered by |contribution|, strongest first (as `computePulse` returns them).
 * @param value the Pulse value, −100..+100; picks the leading side.
 * @param conflict whether both indices reached `PULSE_CONFLICT_MIN`.
 */
export function buildPulseSummary(
  drivers: readonly PulseSummaryDriver[],
  value: number,
  conflict: boolean,
): string {
  const pick = (sign: 1 | -1): string[] =>
    drivers
      .filter((d) => d.sign === sign)
      .slice(0, PULSE_SUMMARY_PER_SIDE)
      .map((d) => shorten(d.label, PULSE_SUMMARY_LABEL_MAX_CHARS));
  const bears = pick(-1);
  const bulls = pick(1);
  if (bears.length === 0 && bulls.length === 0) return NEUTRAL_SUMMARY;

  let line = render(bears, bulls, value, conflict);
  while (line.length > PULSE_SUMMARY_MAX_CHARS && (bears.length > 1 || bulls.length > 1)) {
    if (bears.length >= bulls.length && bears.length > 1) bears.pop();
    else bulls.pop();
    line = render(bears, bulls, value, conflict);
  }
  return line.length > PULSE_SUMMARY_MAX_CHARS
    ? `${line.slice(0, PULSE_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
    : line;
}
