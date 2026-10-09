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

/** Segmented scope control for the Market Pulse; reuses the `.news-filter` pill look. */
export function PulseScopeSwitch({ value, onChange }: PulseScopeSwitchProps) {
  return (
    <div className="news-filter" role="group" aria-label="Pulse scope">
      {PULSE_SCOPES.map((scope) => (
        <button
          key={scope}
          type="button"
          aria-pressed={value === scope}
          onClick={() => onChange(scope)}
        >
          {SCOPE_LABELS[scope]}
        </button>
      ))}
    </div>
  );
}
