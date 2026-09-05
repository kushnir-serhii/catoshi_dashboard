import type { ForecastTarget } from '@/consts/projections';
import type { ForecastGenerationResult } from '@/data/types';
import { generateClaudeForecast } from '@/lib/forecast/claude';
import { generateOpenAIForecast } from '@/lib/forecast/openai';
import { validateForecastParams } from '@/lib/forecast/params';
import type { MarketData } from '@/lib/marketData';

export async function generateForecast(
  service: string,
  model: string,
  marketData: MarketData,
  targets: readonly ForecastTarget[],
): Promise<ForecastGenerationResult> {
  const validated = validateForecastParams(service, model);

  if (validated.service === 'openai') {
    return generateOpenAIForecast(marketData, validated.model, targets);
  }

  return generateClaudeForecast(marketData, validated.model, targets);
}
