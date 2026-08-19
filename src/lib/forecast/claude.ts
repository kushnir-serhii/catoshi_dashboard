import Anthropic from '@anthropic-ai/sdk';

import type { ForecastTarget } from '@/consts/projections';
import { FORECAST_GRID_DAYS, PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import type { ForecastPoint, ProjectionData } from '@/data/types';
import type { MarketData } from '@/lib/marketData';

const TOOL_INPUT_SCHEMA: Anthropic.Tool['input_schema'] = {
  type: 'object',
  properties: {
    projections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          coin: { type: 'string' },
          currentPrice: { type: 'number' },
          confidence: {
            type: 'number',
            description: '0-100',
          },
          reasoning: {
            type: 'array',
            items: { type: 'string' },
            description: '2-3 short bullets',
          },
          bull: {
            type: 'array',
            items: {
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
            },
            description: `Array of {d,p} points, one for each of the ${FORECAST_GRID_DAYS.length} day offsets listed in the prompt`,
          },
          base: {
            type: 'array',
            items: {
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
            },
            description: `Array of {d,p} points, one for each of the ${FORECAST_GRID_DAYS.length} day offsets listed in the prompt`,
          },
          bear: {
            type: 'array',
            items: {
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
            },
            description: `Array of {d,p} points, one for each of the ${FORECAST_GRID_DAYS.length} day offsets listed in the prompt`,
          },
        },
        required: ['coin', 'currentPrice', 'confidence', 'reasoning', 'bull', 'base', 'bear'],
      },
    },
  },
  required: ['projections'],
};

interface ProjectionToolInput {
  projections: Array<{
    coin: string;
    currentPrice: number;
    confidence: number;
    reasoning: string[];
    bull: Array<{ d: number; p: number }>;
    base: Array<{ d: number; p: number }>;
    bear: Array<{ d: number; p: number }>;
  }>;
}

function buildPrompt(marketData: MarketData, targets: readonly ForecastTarget[]): string {
  const coinList = targets.map((t) => t.symbol).join(', ');
  const historyLines = targets
    .map(
      (t) =>
        `- ${t.name} 90-day data points: ${marketData.historicalPrices[t.id]?.length ?? 0} entries`,
    )
    .join('\n');

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
${historyLines}

## Instructions
Call the generate_projections tool with projections for ${coinList}. For each coin:
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

function snapScenarioToGrid(
  points: Array<{ d: number; p: number }> | undefined,
): ForecastPoint[] | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length < FORECAST_GRID_DAYS.length / 2) return null;

  const result: ForecastPoint[] = [];
  for (const gridDay of FORECAST_GRID_DAYS) {
    let nearest = points[0];
    let nearestDist = Math.abs(points[0].d - gridDay);
    for (const point of points) {
      const dist = Math.abs(point.d - gridDay);
      if (dist < nearestDist) {
        nearest = point;
        nearestDist = dist;
      }
    }
    result.push({ d: gridDay, p: nearest.p });
  }

  return result;
}

export async function generateClaudeForecast(
  marketData: MarketData,
  model: string,
  targets: readonly ForecastTarget[],
): Promise<ProjectionData[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const coinList = targets.map((t) => t.symbol).join(', ');

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
        content: buildPrompt(marketData, targets),
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
        service: 'claude' as const,
        model,
        schemaVersion: PROJECTION_SCHEMA_VERSION,
      };
    })
    .filter((x): x is ProjectionData => x !== null);
}
