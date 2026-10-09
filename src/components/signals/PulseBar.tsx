import { PULSE_ZONE_THRESHOLD } from '@/consts/pulse';
import { cn } from '@/utils/cn';

interface PulseBarProps {
  value: number;
  prev24h: number | null;
  conflict: boolean;
  greyed?: boolean;
}

const CONFLICT_COPY =
  'Strong signals point both ways. Direction is unreliable; expect wider swings.';

/** Zone boundaries (−threshold / +threshold) as % of the track. */
const LOW_EDGE = 50 - PULSE_ZONE_THRESHOLD / 2;
const HIGH_EDGE = 50 + PULSE_ZONE_THRESHOLD / 2;

/** Map −100..+100 to 0..100 (% of the track), clamped. */
function toPercent(v: number): number {
  return Math.min(100, Math.max(0, (v + 100) / 2));
}

function zoneLabel(v: number): string {
  if (v > PULSE_ZONE_THRESHOLD) return 'Bullish';
  if (v < -PULSE_ZONE_THRESHOLD) return 'Bearish';
  return 'Range';
}

function zoneColor(v: number): string {
  if (v > PULSE_ZONE_THRESHOLD) return 'var(--pulse-bull)';
  if (v < -PULSE_ZONE_THRESHOLD) return 'var(--pulse-bear)';
  return 'var(--pulse-range)';
}

/** Signed number with a real minus sign. */
function formatSigned(v: number): string {
  const r = Math.round(v);
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '0';
}

/** Market Pulse bar: three-zone track, current marker, hollow 24h ghost marker, conflict stripes. */
export function PulseBar({ value, prev24h, conflict, greyed = false }: PulseBarProps) {
  const label = zoneLabel(value);
  const signed = formatSigned(value);
  const valueText = `${label}, ${signed}${conflict ? ', conflict' : ''}`;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-lg" style={{ color: zoneColor(value) }}>
          {signed}
        </span>
        <span className="text-sm leading-(--lh-normal)">{label}</span>
        {conflict ? (
          <span className="rounded-pill border-line bg-surface-2 border px-2 py-1 text-sm leading-(--lh-normal)">
            <span aria-hidden="true">{'⚖️'} </span>Conflict
          </span>
        ) : null}
      </div>

      <div
        role="meter"
        aria-label="Market Pulse"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={valueText}
        className={cn('relative mx-1.75 h-3.5', greyed && 'opacity-60 grayscale')}
      >
        <div
          className="rounded-pill absolute inset-x-0 inset-y-1 opacity-85"
          style={{
            background: `linear-gradient(to right, var(--pulse-bear) 0%, var(--pulse-bear) ${LOW_EDGE}%, var(--pulse-range) ${LOW_EDGE}%, var(--pulse-range) ${HIGH_EDGE}%, var(--pulse-bull) ${HIGH_EDGE}%, var(--pulse-bull) 100%)`,
          }}
        />
        {conflict ? (
          <div
            aria-hidden="true"
            className="rounded-pill absolute inset-x-0 inset-y-1 bg-[rgba(0,0,0,0.35)] bg-[repeating-linear-gradient(135deg,var(--pulse-conflict-stripe)_0_4px,transparent_4px_8px)]"
          />
        ) : null}
        {prev24h != null ? (
          <span
            aria-hidden="true"
            title={`24h ago: ${formatSigned(prev24h)}`}
            className="border-text-2 absolute top-0 -ml-1.75 box-border size-3.5 rounded-[50%] border-2 bg-transparent"
            style={{ left: `${toPercent(prev24h)}%` }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="border-surface-2 bg-text absolute top-0 -ml-1.75 box-border size-3.5 rounded-[50%] border-2"
          style={{ left: `${toPercent(value)}%` }}
        />
      </div>

      {conflict ? (
        <p className="text-text-3 m-0 text-sm leading-(--lh-normal)">{CONFLICT_COPY}</p>
      ) : null}
    </div>
  );
}
