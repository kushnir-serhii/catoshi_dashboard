import type { ProjectionData } from '@/data/types';
import type { MarketData } from '@/lib/marketData';
import { generateClaudeForecast } from '@/lib/forecast/claude';
import { generateOpenAIForecast } from '@/lib/forecast/openai';

const ALLOWED: Record<string, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

const DEFAULT_SERVICE = 'claude';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function validateParams(service: string, model: string): { service: string; model: string } {
  const allowedModels = ALLOWED[service];
  if (!allowedModels || !allowedModels.includes(model)) {
    return { service: DEFAULT_SERVICE, model: DEFAULT_MODEL };
  }
  return { service, model };
}

export async function generateForecast(
  service: string,
  model: string,
  marketData: MarketData,
): Promise<ProjectionData[]> {
  const validated = validateParams(service, model);

  if (validated.service === 'openai') {
    return generateOpenAIForecast(marketData, validated.model);
  }

  return generateClaudeForecast(marketData, validated.model);
}
