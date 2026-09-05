import {
  ALLOWED_FORECAST_MODELS,
  DEFAULT_FORECAST_MODEL,
  DEFAULT_FORECAST_SERVICE,
} from '@/consts/projections';

export function validateForecastParams(
  service: string,
  model: string,
): { service: string; model: string } {
  const allowedModels = ALLOWED_FORECAST_MODELS[service];
  if (!allowedModels || !allowedModels.includes(model)) {
    return { service: DEFAULT_FORECAST_SERVICE, model: DEFAULT_FORECAST_MODEL };
  }
  return { service, model };
}
