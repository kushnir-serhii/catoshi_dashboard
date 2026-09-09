import OpenAI from 'openai';

import type { ForecastTarget } from '@/consts/projections';
import { FORECAST_MAX_OUTPUT_TOKENS, PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
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

interface ProjectionItem {
  coin: string;
  currentPrice: number;
  confidence: number;
  scenarioProbabilities: { bull: number; base: number; bear: number };
  reasoning: string[];
  bull: Array<{ d: number; p: number }>;
  base: Array<{ d: number; p: number }>;
  bear: Array<{ d: number; p: number }>;
}

interface ProjectionsJson {
  projections: ProjectionItem[];
}

function isProjectionsJson(value: unknown): value is ProjectionsJson {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj['projections'])) return false;
  return obj['projections'].every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const p = item as Record<string, unknown>;
    return (
      typeof p['coin'] === 'string' &&
      typeof p['currentPrice'] === 'number' &&
      typeof p['confidence'] === 'number' &&
      typeof p['scenarioProbabilities'] === 'object' &&
      p['scenarioProbabilities'] !== null &&
      Array.isArray(p['reasoning']) &&
      Array.isArray(p['bull']) &&
      Array.isArray(p['base']) &&
      Array.isArray(p['bear'])
    );
  });
}

export async function generateOpenAIForecast(
  marketData: MarketData,
  model: string,
  targets: readonly ForecastTarget[],
): Promise<ForecastGenerationResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const inputs = buildForecastInputs(marketData, targets);
  const { coinList } = inputs;

  const completion = await client.chat.completions.create({
    model,
    max_tokens: FORECAST_MAX_OUTPUT_TOKENS,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'generate_projections',
        description: `Price projections for ${coinList} across bull, base, and bear scenarios on a fixed day grid.`,
        schema: PROJECTIONS_OUTPUT_SCHEMA,
        strict: true,
      },
    },
    messages: [
      {
        role: 'system',
        content:
          'You are a professional cryptocurrency analyst. Always respond with valid JSON matching the requested schema.',
      },
      {
        role: 'user',
        content: buildForecastPrompt(
          inputs,
          `Return a JSON object with a "projections" array containing objects for ${coinList}.`,
        ),
      },
    ],
  });

  const choice = completion.choices[0];

  // A batch that runs past the output cap comes back as a syntactically
  // broken JSON document, so the parse below would report it as a malformed
  // model response rather than as the budget problem it is. Name it here.
  if (choice?.finish_reason === 'length') {
    throw new Error(
      `OpenAI response was truncated at the ${FORECAST_MAX_OUTPUT_TOKENS}-token output cap`,
    );
  }

  const rawContent = choice?.message?.content;
  if (!rawContent) {
    throw new Error('OpenAI returned empty content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error('OpenAI response is not valid JSON');
  }

  if (!isProjectionsJson(parsed)) {
    throw new Error('OpenAI response does not match expected projections schema');
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
          service: 'openai' as const,
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
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}
