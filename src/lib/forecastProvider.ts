import type { ForecastTarget } from '@/consts/projections';
import {
  ALLOWED_FORECAST_MODELS,
  DEFAULT_FORECAST_MODEL,
  DEFAULT_FORECAST_SERVICE,
} from '@/consts/projections';
import type { ForecastGenerationResult } from '@/data/types';
import { generateClaudeForecast } from '@/lib/forecast/claude';
import { generateOpenAIForecast } from '@/lib/forecast/openai';
import type { MarketData } from '@/lib/marketData';

function validateParams(service: string, model: string): { service: string; model: string } {
  const allowedModels = ALLOWED_FORECAST_MODELS[service];
  if (!allowedModels || !allowedModels.includes(model)) {
    return { service: DEFAULT_FORECAST_SERVICE, model: DEFAULT_FORECAST_MODEL };
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
