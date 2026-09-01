/**
 * Best-effort per-model token pricing, used only to populate the analytics
 * `forecasts.cost_usd` column (spec 010 Slice 6) for cost tracking/reporting.
 * This is NOT billing-grade — it is a reasonable approximation based on each
 * model family's publicly published per-1M-token pricing as of this model's
 * knowledge cutoff (January 2026). If a provider changes pricing, update the
 * numbers below; there is no live pricing API being called.
 *
 * Source: Anthropic and OpenAI public pricing pages (per-family tiers),
 * recalled from training data — treat as approximate, not authoritative.
 *
 * Keys must match the model ids in `ALLOWED` (src/lib/forecastProvider.ts).
 */
export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

export const FORECAST_MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude family
  'claude-haiku-4-5-20251001': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-8': { inputPerMillion: 15, outputPerMillion: 75 },

  // OpenAI family
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
};
