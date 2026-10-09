import { PULSE_ZONE_THRESHOLD } from '@/consts/pulse';

interface PulseBarProps {
  value: number;
  prev24h: number | null;
  conflict: boolean;
  greyed?: boolean;
}

const MARKER_SIZE = 14;
const TRACK_INSET = `${MARKER_SIZE / 2 - 3}px 0`;

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
    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
      <div
        style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 'var(--fs-lg)', color: zoneColor(value) }}>{signed}</span>
        <span className="small">{label}</span>
        {conflict ? (
          <span
            className="small"
            style={{
              padding: 'var(--sp-1) var(--sp-2)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--line)',
              background: 'var(--surface-2)',
            }}
          >
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
        style={{
          position: 'relative',
          height: MARKER_SIZE,
          margin: `0 ${MARKER_SIZE / 2}px`,
          filter: greyed ? 'grayscale(1)' : undefined,
          opacity: greyed ? 0.6 : undefined,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: TRACK_INSET,
            borderRadius: 'var(--radius-pill)',
            background: `linear-gradient(to right, var(--pulse-bear) 0%, var(--pulse-bear) ${LOW_EDGE}%, var(--pulse-range) ${LOW_EDGE}%, var(--pulse-range) ${HIGH_EDGE}%, var(--pulse-bull) ${HIGH_EDGE}%, var(--pulse-bull) 100%)`,
            opacity: 0.85,
          }}
        />
        {conflict ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: TRACK_INSET,
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--pulse-conflict-stripe) 0 4px, transparent 4px 8px)',
            }}
          />
        ) : null}
        {prev24h != null ? (
          <span
            aria-hidden="true"
            title={`24h ago: ${formatSigned(prev24h)}`}
            style={{
              position: 'absolute',
              top: 0,
              left: `${toPercent(prev24h)}%`,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              marginLeft: -MARKER_SIZE / 2,
              boxSizing: 'border-box',
              borderRadius: '50%',
              border: '2px solid var(--text-2)',
              background: 'transparent',
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: `${toPercent(value)}%`,
            width: MARKER_SIZE,
            height: MARKER_SIZE,
            marginLeft: -MARKER_SIZE / 2,
            boxSizing: 'border-box',
            borderRadius: '50%',
            border: '2px solid var(--surface-2)',
            background: 'var(--text)',
          }}
        />
      </div>

      {conflict ? (
        <p className="small muted" style={{ margin: 0 }}>
          {CONFLICT_COPY}
        </p>
      ) : null}
    </div>
  );
}
