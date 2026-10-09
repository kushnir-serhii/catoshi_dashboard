import { PULSE_SCOPES } from '@/consts/pulse';
import type { PulseScope } from '@/data/types';

interface PulseScopeSwitchProps {
  value: PulseScope;
  onChange: (scope: PulseScope) => void;
}

const SCOPE_LABELS: Record<PulseScope, string> = {
  market: 'Market',
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL',
};

/** Segmented scope control for the Market Pulse; the `.news-filter` pill look. */
export function PulseScopeSwitch({ value, onChange }: PulseScopeSwitchProps) {
  return (
    <div role="group" aria-label="Pulse scope" className="inline-flex flex-wrap gap-1">
      {PULSE_SCOPES.map((scope) => (
        <button
          key={scope}
          type="button"
          aria-pressed={value === scope}
          onClick={() => onChange(scope)}
          className="rounded-pill border-line text-text-2 aria-pressed:text-info cursor-pointer border bg-transparent px-2 py-1 font-mono text-xs aria-pressed:border-[oklch(0.6_0.13_265/0.5)] aria-pressed:bg-[oklch(0.6_0.13_265/0.18)] pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:justify-center"
        >
          {SCOPE_LABELS[scope]}
        </button>
      ))}
    </div>
  );
}
