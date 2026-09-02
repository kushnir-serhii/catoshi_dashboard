'use client';

import { CLAUDE_MODELS, OPENAI_MODELS } from '@/hooks/useForecastSettings';

interface ForecastModeIndicatorProps {
  service: string;
  model: string;
  /** Opens the forecast settings modal. */
  onOpen: () => void;
}

interface ResolvedMode {
  provider: string;
  model: string;
  accent: string;
}

/** Resolve the stored { service, model } pair into display labels. The
 * provider is derived from the model id (not the stored service) so the
 * label can never show a mismatched pair like "Claude · GPT-4o mini". */
function resolveMode(service: string, model: string): ResolvedMode {
  const claude = CLAUDE_MODELS.find((m) => m.id === model);
  if (claude) {
    return { provider: 'Claude', model: claude.label, accent: 'oklch(0.72 0.14 55)' };
  }
  const openai = OPENAI_MODELS.find((m) => m.id === model);
  if (openai) {
    return { provider: 'OpenAI', model: openai.label, accent: 'oklch(0.74 0.13 165)' };
  }
  // Unknown model id — fall back to the stored service and the raw id.
  return {
    provider: service === 'claude' ? 'Claude' : 'OpenAI',
    model: model || 'Default',
    accent: 'oklch(0.72 0.05 280)',
  };
}

export function ForecastModeIndicator({ service, model, onOpen }: ForecastModeIndicatorProps) {
  const { provider, model: modelLabel, accent } = resolveMode(service, model);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="forecast-mode-indicator"
      aria-label={`Forecast model: ${provider} ${modelLabel}. Click to change.`}
      title="Forecast provider and model — click to change"
    >
      <span
        className="forecast-mode-indicator__dot"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
        aria-hidden="true"
      />
      <span className="forecast-mode-indicator__text">
        <span className="forecast-mode-indicator__label">Forecast model</span>
        <span className="forecast-mode-indicator__value">
          {provider} <span aria-hidden="true">·</span> {modelLabel}
        </span>
      </span>
      <svg
        className="forecast-mode-indicator__chevron"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
