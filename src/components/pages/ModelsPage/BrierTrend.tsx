import { NO_SKILL_BRIER_BASELINE } from '@/consts/scoring';
import type { ModelTrendPoint } from '@/data/types';

/** Month-over-month mean Brier, drawn against the no-skill baseline. Lower is better. */
export function BrierTrend({ points }: { points: ModelTrendPoint[] }) {
  const width = 320;
  const height = 96;
  const padX = 6;
  const padY = 10;

  const values = points.map((p) => p.meanBrier);
  const yMax = Math.max(NO_SKILL_BRIER_BASELINE, ...values) * 1.15;
  const yMin = 0;

  const x = (i: number): number =>
    points.length <= 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - 2 * padX);
  const y = (v: number): number =>
    height - padY - ((v - yMin) / (yMax - yMin || 1)) * (height - 2 * padY);

  const baselineY = y(NO_SKILL_BRIER_BASELINE);
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.meanBrier).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block max-w-full overflow-visible"
      role="img"
      aria-label="Mean Brier score by month against the no-skill baseline"
    >
      <line
        x1={padX}
        x2={width - padX}
        y1={baselineY}
        y2={baselineY}
        stroke="var(--color-text-3)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text
        x={padX}
        y={baselineY - 4}
        fontSize="11"
        fill="var(--color-text-3)"
        fontFamily="var(--font-mono)"
      >
        baseline {NO_SKILL_BRIER_BASELINE}
      </text>
      {points.length > 1 && (
        <path d={linePath} fill="none" stroke="var(--color-chart-base)" strokeWidth="1.6" />
      )}
      {points.map((p, i) => (
        <circle
          key={p.month}
          cx={x(i)}
          cy={y(p.meanBrier)}
          r={3}
          fill={p.meanBrier <= NO_SKILL_BRIER_BASELINE ? 'var(--color-green)' : 'var(--color-red)'}
        />
      ))}
    </svg>
  );
}
