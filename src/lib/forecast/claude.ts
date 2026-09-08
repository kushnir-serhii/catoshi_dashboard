import Anthropic from '@anthropic-ai/sdk';

import type { ForecastTarget } from '@/consts/projections';
import { PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import type { ForecastGenerationResult, ProjectionData } from '@/data/types';
import type { MarketData } from '@/lib/marketData';

import { normalizeProbabilities, snapScenarioToGrid } from './gridSnap';
import {
  buildForecastInputs,
  buildForecastPrompt,
  FORECAST_PROMPT_VERSION,
  PROJECTIONS_OUTPUT_SCHEMA,
} from './inputs';
import { rebaseToMarketPrice } from './priceContext';

/** @deprecated Use `FORECAST_PROMPT_VERSION` from `./inputs`. Re-exported for callers. */
export const PROMPT_VERSION = FORECAST_PROMPT_VERSION;

const TOOL_INPUT_SCHEMA = PROJECTIONS_OUTPUT_SCHEMA as unknown as Anthropic.Tool['input_schema'];

interface ProjectionToolInput {
  projections: Array<{
    coin: string;
    currentPrice: number;
    confidence: number;
    scenarioProbabilities: { bull: number; base: number; bear: number };
    reasoning: string[];
    bull: Array<{ d: number; p: number }>;
    base: Array<{ d: number; p: number }>;
    bear: Array<{ d: number; p: number }>;
  }>;
}

export async function generateClaudeForecast(
  marketData: MarketData,
  model: string,
  targets: readonly ForecastTarget[],
): Promise<ForecastGenerationResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const inputs = buildForecastInputs(marketData, targets);
  const { coinList } = inputs;

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    tools: [
      {
        name: 'generate_projections',
        description: `Generate price projections for ${coinList} across bull, base, and bear scenarios on a fixed day grid.`,
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'generate_projections' },
    messages: [
      {
        role: 'user',
        content: buildForecastPrompt(
          inputs,
          `Call the generate_projections tool with projections for ${coinList}.`,
        ),
      },
    ],
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use block');
  }

  const parsed = toolUseBlock.input as ProjectionToolInput;

  if (!Array.isArray(parsed.projections)) {
    throw new Error('Claude tool input missing projections array');
  }

  const generatedAt = new Date().toISOString();

  // The real last close per symbol — the same number the prompt told the model
  // to use as currentPrice, kept here as the safety net in case it ignored it.
  const marketPriceBySymbol = inputs.referencePrices;

  const projections = parsed.projections
    .map((p): ProjectionData | null => {
      const bull = snapScenarioToGrid(p.bull);
      const base = snapScenarioToGrid(p.base);
      const bear = snapScenarioToGrid(p.bear);

      if (!bull || !base || !bear) return null;

      return rebaseToMarketPrice<ProjectionData>(
        {
          coin: p.coin,
          bull,
          base,
          bear,
          currentPrice: p.currentPrice,
          generatedAt,
          confidence: p.confidence,
          scenarioProbabilities: normalizeProbabilities(p.scenarioProbabilities),
          reasoning: p.reasoning,
          service: 'claude' as const,
          model,
          schemaVersion: PROJECTION_SCHEMA_VERSION,
        },
        marketPriceBySymbol.get(p.coin.toUpperCase()),
      );
    })
    .filter((x): x is ProjectionData => x !== null);

  return {
    projections,
    promptVersion: FORECAST_PROMPT_VERSION,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
