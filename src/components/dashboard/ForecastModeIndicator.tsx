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
    return { provider: 'Claude', model: claude.label, accent: 'var(--color-accent-claude)' };
  }
  const openai = OPENAI_MODELS.find((m) => m.id === model);
  if (openai) {
    return { provider: 'OpenAI', model: openai.label, accent: 'var(--color-accent-openai)' };
  }
  // Unknown model id — fall back to the stored service and the raw id.
  return {
    provider: service === 'claude' ? 'Claude' : 'OpenAI',
    model: model || 'Default',
    accent: 'var(--color-accent-neutral)',
  };
}

export function ForecastModeIndicator({ service, model, onOpen }: ForecastModeIndicatorProps) {
  const { provider, model: modelLabel, accent } = resolveMode(service, model);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-pill bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text focus-visible:outline-violet inline-flex cursor-pointer items-center gap-2 px-3 py-1 transition-[border-color,background,color] duration-(--dur-fast) ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none max-[640px]:w-full max-[640px]:rounded pointer-coarse:min-h-11 pointer-coarse:justify-center"
      aria-label={`Forecast model: ${provider} ${modelLabel}. Click to change.`}
      title="Forecast provider and model — click to change"
    >
      <span
        className="rounded-pill h-1.75 w-1.75 shrink-0"
        style={{ background: accent, boxShadow: `0 0 var(--glow-sm) ${accent}` }}
        aria-hidden="true"
      />
      <span className="flex flex-col text-left leading-(--lh-snug)">
        <span className="text-text-3 text-xs tracking-(--ls-label) uppercase">Forecast model</span>
        <span className="overflow-hidden text-sm font-medium text-ellipsis whitespace-nowrap">
          {provider} <span aria-hidden="true">·</span> {modelLabel}
        </span>
      </span>
      <svg
        className="text-text-3 shrink-0 max-[640px]:ml-auto"
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
