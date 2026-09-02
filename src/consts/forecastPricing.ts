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

/**
 * Best-effort USD cost from token counts, using `FORECAST_MODEL_PRICING`.
 * Returns `null` for an unrecognised model rather than guessing — a null
 * `cost_usd` is preferable to a silently wrong one. Rounded to 6 decimals to
 * match the `numeric(12, 6)` cost columns.
 *
 * Used by the forecast persist path (spec 010/011) and the news classification
 * persist path (spec 015, Slice 4) — both write a measured `cost_usd`, and the
 * news classification model (`NEWS_CLASSIFY_MODEL`) is already priced above.
 */
export function computeModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = FORECAST_MODEL_PRICING[model];
  if (!pricing) return null;
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.round(cost * 1e6) / 1e6;
}
