import type { RuleDefinition } from '../types';

import { etfStreak } from './etf_streak';
import { fearGreedExtreme } from './fear_greed_extreme';
import { fundingExtreme } from './funding_extreme';
import { fundingFlip } from './funding_flip';
import { longShortExtreme } from './long_short_extreme';
import { maCompression } from './ma_compression';
import { maCrossDaily } from './ma_cross_daily';
import { oiSurge } from './oi_surge';
import { priceStretchedMa99 } from './price_stretched_ma99';
import { rsi1dOverbought } from './rsi_1d_overbought';
import { rsi1dOversold } from './rsi_1d_oversold';
import { rsiDivergence4h1d } from './rsi_divergence_4h_1d';
import { sentimentSwing } from './sentiment_swing';
import { structureFlipDaily } from './structure_flip_daily';
import { volatilityExpansion } from './volatility_expansion';
import { volumeSpike } from './volume_spike';

/**
 * Every rule in the starting set (technical-considerations §4). The writer
 * (slice 4) runs each one over a freshly written snapshot.
 */
export const RULES: readonly RuleDefinition[] = [
  rsi1dOverbought,
  rsi1dOversold,
  rsiDivergence4h1d,
  fundingFlip,
  fundingExtreme,
  oiSurge,
  etfStreak,
  volumeSpike,
  maCompression,
  fearGreedExtreme,

  // Second set — each reads a snapshot field no rule above touches.
  maCrossDaily,
  longShortExtreme,
  sentimentSwing,
  priceStretchedMa99,
  structureFlipDaily,
  volatilityExpansion,
] as const;

/** The same rules keyed by `ruleId`, for provenance lookups. */
export const RULES_BY_ID: Readonly<Record<string, RuleDefinition>> = Object.fromEntries(
  RULES.map((rule) => [rule.ruleId, rule]),
);
