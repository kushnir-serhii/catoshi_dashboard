import type { PulseDriver } from '@/data/types';
import { cn } from '@/utils/cn';

interface PulseDriverChipsProps {
  drivers: PulseDriver[];
  onSelect: (signalId: string) => void;
}

/** Top-driver chips of the Market Pulse, in the given (|contribution|) order. */
export function PulseDriverChips({ drivers, onSelect }: PulseDriverChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {drivers.map((d) => {
        const tone =
          d.sign === 1 ? 'border-chart-bull text-chart-bull' : 'border-chart-bear text-chart-bear';
        const text = d.display && d.display !== d.label ? `${d.label} · ${d.display}` : d.label;
        return (
          <button
            key={d.signalId}
            type="button"
            onClick={() => onSelect(d.signalId)}
            className={cn(
              'rounded-pill bg-surface-2 max-w-full cursor-pointer border px-3 py-1 text-left text-sm leading-(--lh-normal)',
              tone,
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
