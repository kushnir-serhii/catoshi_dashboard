import type { ForecastTarget } from '@/consts/projections';
import type { ForecastGenerationResult } from '@/data/types';
import { generateClaudeForecast } from '@/lib/forecast/claude';
import { generateOpenAIForecast } from '@/lib/forecast/openai';
import type { MarketData } from '@/lib/marketData';

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
  targets: readonly ForecastTarget[],
): Promise<ForecastGenerationResult> {
  const validated = validateParams(service, model);

  if (validated.service === 'openai') {
    return generateOpenAIForecast(marketData, validated.model, targets);
  }

  return generateClaudeForecast(marketData, validated.model, targets);
}
