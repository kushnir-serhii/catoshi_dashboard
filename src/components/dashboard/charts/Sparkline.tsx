import { seededRand } from './utils';

export function Sparkline({
  width = 110,
  height = 28,
  seed = 1,
  color = 'green',
}: {
  width?: number;
  height?: number;
  seed?: number;
  color?: 'green' | 'violet' | 'red';
}) {
  const rnd = seededRand(seed);
  const N = 28;
  let val = 50;
  const arr: number[] = [];
  for (let i = 0; i < N; i++) {
    val += (rnd() - 0.45) * 6;
    arr.push(val);
  }
  const min = Math.min(...arr),
    max = Math.max(...arr);
  const xPos = (i: number) => (i / (N - 1)) * (width - 2) + 1;
  const yPos = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const path = arr
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`)
    .join(' ');
  const stroke =
    color === 'violet'
      ? 'var(--color-chart-base)'
      : color === 'red'
        ? 'var(--color-red)'
        : 'var(--color-chart-bull)';
  const fillId = `sparkFill_${seed}_${color}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${xPos(N - 1).toFixed(1)} ${height} L ${xPos(0).toFixed(1)} ${height} Z`}
        fill={`url(#${fillId})`}
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}
