import type { ForecastTarget } from '@/consts/projections';
import { FORECAST_GRID_DAYS } from '@/consts/projections';
import type { MarketData } from '@/lib/marketData';

import { buildPriceContext, lastKnownPrice, PRICE_ANCHOR_INSTRUCTION } from './priceContext';

/**
 * The single assembly of everything a forecast producer needs as input:
 * market data, the per-coin price context, the trusted per-coin reference
 * price, the day grid, the output schema and the prompt version.
 *
 * Both provider modules (`claude.ts`, `openai.ts`) build their prompt from
 * this, and `GET /api/projections/inputs` (spec 020) serialises it for the
 * scheduled task. Keeping it in one place is what stops the routine
 * producer and the paid providers from silently forecasting against
 * different inputs — see spec 020 technical-considerations §2.1.
 */

/**
 * Bump whenever the prompt text changes — this is what keeps the accuracy
 * metric in spec 011 meaningful. Version 1 was the first tracked version of
 * the prompt text (spec 010). Version 2 replaces the price-free "N entries"
 * history line with the real price context from `buildPriceContext` and the
 * explicit price-scale instruction, so the model no longer anchors its
 * projections on a price remembered from training data.
 */
export const FORECAST_PROMPT_VERSION = 2;

const SCENARIO_POINT_SCHEMA = {
  type: 'object',
  properties: {
    d: {
      type: 'number',
      description:
        'Day offset from today, must be one of the exact grid values given in the prompt',
    },
    p: { type: 'number', description: 'Forecasted USD price at day d' },
  },
  required: ['d', 'p'],
  additionalProperties: false,
} as const;

const SCENARIO_ARRAY_SCHEMA = {
  type: 'array',
  items: SCENARIO_POINT_SCHEMA,
  description: `Array of {d,p} points, one for each of the ${FORECAST_GRID_DAYS.length} day offsets listed in the prompt`,
} as const;

/**
 * The canonical output shape every forecast producer must satisfy — the paid
 * providers and the scheduled task alike. `openai.ts` passes it straight to
 * the `json_schema` response format; `claude.ts` passes it as the tool
 * `input_schema`; `/api/projections/inputs` serialises it for the task.
 */
export const PROJECTIONS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    projections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          coin: { type: 'string' },
          currentPrice: { type: 'number' },
          confidence: { type: 'number', description: '0-100' },
          scenarioProbabilities: {
            type: 'object',
            properties: {
              bull: { type: 'number', description: '0-100' },
              base: { type: 'number', description: '0-100' },
              bear: { type: 'number', description: '0-100' },
            },
            required: ['bull', 'base', 'bear'],
            additionalProperties: false,
            description:
              'Likelihood of each scenario playing out; bull + base + bear must sum to 100',
          },
          reasoning: {
            type: 'array',
            items: { type: 'string' },
            description: '2-3 short bullets',
          },
          bull: SCENARIO_ARRAY_SCHEMA,
          base: SCENARIO_ARRAY_SCHEMA,
          bear: SCENARIO_ARRAY_SCHEMA,
        },
        required: [
          'coin',
          'currentPrice',
          'confidence',
          'scenarioProbabilities',
          'reasoning',
          'bull',
          'base',
          'bear',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['projections'],
  additionalProperties: false,
} as const;

export interface ForecastInputs {
  marketData: MarketData;
  targets: readonly ForecastTarget[];
  /** Comma-separated symbols, e.g. `BTC, ETH, SOL`. */
  coinList: string;
  /** The rendered "Historical Price Context" prompt block. */
  priceContext: string;
  /**
   * Per-symbol (upper-cased) trusted reference price used as the anchor
   * check baseline — the same number the prompt tells the producer to use
   * as `currentPrice`.
   *
   * TODO(spec 020, Slice 3): the reference price should be
   * `getLatestSnapshot(symbol)` when within `FORECAST_SNAPSHOT_MAX_AGE_MINUTES`,
   * else the live `/api/prices` value (technical-considerations §2.5). That
   * needs async DB/price I/O, which does not belong in this pure assembly;
   * for now it is the most recent daily close from `marketData`, which is
   * also exactly what the providers used before this extraction.
   */
  referencePrices: Map<string, number | undefined>;
  /** The non-uniform forecast day grid. */
  gridDays: readonly number[];
  /** The canonical output schema every producer's result must satisfy. */
  outputSchema: typeof PROJECTIONS_OUTPUT_SCHEMA;
  promptVersion: number;
}

/**
 * Assembles the forecast inputs from already-fetched market data. Pure and
 * synchronous, mirroring `buildPriceContext`; the market-data fetch stays a
 * caller concern (the providers receive it, the inputs endpoint fetches it).
 */
export function buildForecastInputs(
  marketData: MarketData,
  targets: readonly ForecastTarget[],
): ForecastInputs {
  return {
    marketData,
    targets,
    coinList: targets.map((t) => t.symbol).join(', '),
    priceContext: buildPriceContext(marketData, targets),
    referencePrices: new Map(
      targets.map((t) => [t.symbol.toUpperCase(), lastKnownPrice(marketData, t.id)]),
    ),
    gridDays: FORECAST_GRID_DAYS,
    outputSchema: PROJECTIONS_OUTPUT_SCHEMA,
    promptVersion: FORECAST_PROMPT_VERSION,
  };
}

/**
 * The JSON-serialisable form of {@link ForecastInputs} — what
 * `GET /api/projections/inputs` returns to the scheduled task (spec 020).
 * Drops `marketData.historicalPrices` (already folded into `priceContext`)
 * and turns the reference-price `Map` into a plain record.
 */
export interface SerializedForecastInputs {
  targets: readonly ForecastTarget[];
  marketData: {
    news: string;
    fearGreed: string;
    trending: string;
    reddit: string;
  };
  priceContext: string;
  referencePrices: Record<string, number | null>;
  gridDays: readonly number[];
  outputSchema: typeof PROJECTIONS_OUTPUT_SCHEMA;
  promptVersion: number;
}

export function serializeForecastInputs(inputs: ForecastInputs): SerializedForecastInputs {
  return {
    targets: inputs.targets,
    marketData: {
      news: inputs.marketData.news,
      fearGreed: inputs.marketData.fearGreed,
      trending: inputs.marketData.trending,
      reddit: inputs.marketData.reddit,
    },
    priceContext: inputs.priceContext,
    referencePrices: Object.fromEntries(
      [...inputs.referencePrices].map(([symbol, price]) => [symbol, price ?? null]),
    ),
    gridDays: inputs.gridDays,
    outputSchema: inputs.outputSchema,
    promptVersion: inputs.promptVersion,
  };
}

/**
 * The shared forecast user-prompt. Identical for every producer except the
 * one line naming how the result is returned — the Claude tool call, the
 * OpenAI JSON object, or the scheduled task's own structured answer.
 */
export function buildForecastPrompt(inputs: ForecastInputs, responseInstruction: string): string {
  const { coinList, priceContext, marketData, gridDays } = inputs;

  return `You are a professional cryptocurrency market analyst. Generate price projections for ${coinList} based on the following market data.

## Current Market Data

### News Headlines
${marketData.news}

### Fear & Greed Index (last 7 days)
${marketData.fearGreed}

### Trending Coins
${marketData.trending}

### Reddit Sentiment
${marketData.reddit}

### Historical Price Context
${priceContext}

## Instructions
${responseInstruction} For each coin:
- ${PRICE_ANCHOR_INSTRUCTION}
- Each of the bull, base, and bear scenario arrays must contain exactly one {d,p} point for each of the ${gridDays.length} day offsets in the grid below, with d exactly matching one of the given grid values:
  - Daily, days 1 through 30
  - Weekly, every 7 days from day 37 through day 177
  - Monthly, at days 210, 240, 270, 300, 330, and 365
  - The exact day offsets: ${gridDays.join(', ')}
- Bull scenario: optimistic outlook
- Base scenario: most likely outlook
- Bear scenario: pessimistic outlook
- Provide 2-3 concise reasoning bullets explaining your projections
- Set confidence 0-100 reflecting certainty level
- Set scenarioProbabilities.bull/base/bear to the likelihood (0-100) of each scenario actually playing out, summing to exactly 100 — this is distinct from confidence`;
}
