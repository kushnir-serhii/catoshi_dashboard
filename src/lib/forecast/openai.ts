import OpenAI from 'openai';
import type { ProjectionData } from '@/data/types';
import type { MarketData } from '@/lib/marketData';
import { FORECAST_GRID_DAYS, PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import { snapScenarioToGrid } from './gridSnap';

const SCENARIO_POINT_SCHEMA = {
  type: 'object',
  properties: {
    d: { type: 'number', description: 'Day offset from today, must be one of the exact grid values given in the prompt' },
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

const PROJECTIONS_JSON_SCHEMA = {
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
          reasoning: {
            type: 'array',
            items: { type: 'string' },
            description: '2-3 short bullets',
          },
          bull: SCENARIO_ARRAY_SCHEMA,
          base: SCENARIO_ARRAY_SCHEMA,
          bear: SCENARIO_ARRAY_SCHEMA,
        },
        required: ['coin', 'currentPrice', 'confidence', 'reasoning', 'bull', 'base', 'bear'],
        additionalProperties: false,
      },
    },
  },
  required: ['projections'],
  additionalProperties: false,
} as const;

interface ProjectionItem {
  coin: string;
  currentPrice: number;
  confidence: number;
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
      Array.isArray(p['reasoning']) &&
      Array.isArray(p['bull']) &&
      Array.isArray(p['base']) &&
      Array.isArray(p['bear'])
    );
  });
}

function buildPrompt(marketData: MarketData): string {
  return `You are a professional cryptocurrency market analyst. Generate price projections for BTC, ETH, and SOL based on the following market data.

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
- Bitcoin 90-day data points: ${marketData.historicalPrices['bitcoin']?.length ?? 0} entries
- Ethereum 90-day data points: ${marketData.historicalPrices['ethereum']?.length ?? 0} entries
- Solana 90-day data points: ${marketData.historicalPrices['solana']?.length ?? 0} entries

## Instructions
Return a JSON object with a "projections" array containing objects for BTC, ETH, and SOL. For each coin:
- Set currentPrice to the last known price from historical data or your best estimate
- Each of the bull, base, and bear scenario arrays must contain exactly one {d,p} point for each of the ${FORECAST_GRID_DAYS.length} day offsets in the grid below, with d exactly matching one of the given grid values:
  - Daily, days 1 through 30
  - Weekly, every 7 days from day 37 through day 177
  - Monthly, at days 210, 240, 270, 300, 330, and 365
  - The exact day offsets: ${FORECAST_GRID_DAYS.join(', ')}
- Bull scenario: optimistic outlook
- Base scenario: most likely outlook
- Bear scenario: pessimistic outlook
- Provide 2-3 concise reasoning bullets explaining your projections
- Set confidence 0-100 reflecting certainty level`;
}

export async function generateOpenAIForecast(
  marketData: MarketData,
  model: string,
): Promise<ProjectionData[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'generate_projections',
        description:
          'Price projections for BTC, ETH, and SOL across bull, base, and bear scenarios on a fixed day grid.',
        schema: PROJECTIONS_JSON_SCHEMA,
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
        content: buildPrompt(marketData),
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content;
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

  return parsed.projections
    .map((p): ProjectionData | null => {
      const bull = snapScenarioToGrid(p.bull);
      const base = snapScenarioToGrid(p.base);
      const bear = snapScenarioToGrid(p.bear);

      if (!bull || !base || !bear) return null;

      return {
        coin: p.coin,
        bull,
        base,
        bear,
        currentPrice: p.currentPrice,
        generatedAt,
        confidence: p.confidence,
        reasoning: p.reasoning,
        service: 'openai' as const,
        model,
        schemaVersion: PROJECTION_SCHEMA_VERSION,
      };
    })
    .filter((x): x is ProjectionData => x !== null);
}
