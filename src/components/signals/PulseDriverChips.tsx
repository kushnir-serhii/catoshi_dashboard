import type { PulseDriver } from '@/data/types';

interface PulseDriverChipsProps {
  drivers: PulseDriver[];
  onSelect: (signalId: string) => void;
}

/** Top-driver chips of the Market Pulse, in the given (|contribution|) order. */
export function PulseDriverChips({ drivers, onSelect }: PulseDriverChipsProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
      {drivers.map((d) => {
        const color = d.sign === 1 ? 'var(--pulse-bull)' : 'var(--pulse-bear)';
        const text = d.display && d.display !== d.label ? `${d.label} · ${d.display}` : d.label;
        return (
          <button
            key={d.signalId}
            type="button"
            onClick={() => onSelect(d.signalId)}
            className="small"
            style={{
              padding: 'var(--sp-1) var(--sp-3)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-2)',
              border: `1px solid ${color}`,
              color,
              cursor: 'pointer',
              textAlign: 'left',
              maxWidth: '100%',
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
