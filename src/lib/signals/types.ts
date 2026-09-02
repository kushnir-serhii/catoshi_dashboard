import type { MarketSnapshot } from '@/data/types';

/**
 * Sentiment label a rule assigns to the condition it detected. Matches the
 * `tag in ('BULLISH','BEARISH','NEUTRAL')` check on `public.signals`
 * (db/migrations/0004_signals.sql).
 */
export type SignalTag = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/**
 * What a rule returns when its condition holds. This is NOT the DB row: there is
 * no `id`, no `snapshot_ts`/`since_ts`, no `created_at` — those are the writer's
 * job (slice 4). A rule only describes the condition it found.
 */
export interface Signal {
  /** Origin rule, e.g. `rsi_1d_overbought`. Matches `RuleDefinition.ruleId`. */
  ruleId: string;
  tag: SignalTag;
  /** The condition in plain language, <= 8 words (functional-spec 2.1). */
  title: string;
  /** Why it matters, <= 20 words, carrying the actual measured number (functional-spec 2.1, risk 8.1). */
  body: string;
  /** The rule's origin shown on the card, e.g. `RSI 1d`, `Funding` — never a news domain. */
  source: string;
  /**
   * Normalised distance past the rule's threshold, clamped to 0..1 — RSI 85
   * outranks RSI 71. Rules with no natural scale return `SEVERITY_FIXED_MID`.
   */
  severity: number;
}

/**
 * A pure rule. Given the current snapshot and the previous one (or `null` when
 * there is no prior snapshot), it returns a `Signal` if its condition holds, or
 * `null`. It performs no I/O.
 *
 * NULL DISCIPLINE (functional-spec 2.6): the moment any input the rule needs is
 * `null`/`undefined` it must return `null`. It must never substitute `0`, `50`,
 * or any other default — a rule reading funding must stay silent when funding is
 * unknown, not announce a flip to zero.
 */
export type Rule = (snapshot: MarketSnapshot, previous: MarketSnapshot | null) => Signal | null;

/**
 * A rule paired with its stable id. The id is carried here (not only inside the
 * `Signal`) so the writer can iterate every rule and know which one produced
 * nothing this hour — needed for `since_ts` carry-forward (slice 4).
 */
export interface RuleDefinition {
  ruleId: string;
  run: Rule;
}
