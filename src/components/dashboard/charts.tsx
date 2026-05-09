'use client';

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateProjection() {
  const rnd = seededRand(42);
  const histLen = 90;
  const fwdLen = 60;
  let hist: number[] = [];
  let v = 62000;
  for (let i = 0; i < histLen; i++) {
    v *= 1 + (rnd() - 0.48) * 0.022;
    hist.push(v);
  }
  const last = hist[hist.length - 1];
  let bull = [last], base = [last], bear = [last];
  for (let i = 1; i < fwdLen; i++) {
    const noise = (rnd() - 0.5) * 0.012;
    bull.push(bull[i - 1] * (1 + 0.0058 + noise));
    base.push(base[i - 1] * (1 + 0.0021 + noise));
    bear.push(bear[i - 1] * (1 - 0.0014 + noise));
  }
  return { hist, bull, base, bear };
}

export const PROJ = generateProjection();

export function ProjectionChart({ width = 820, height = 320, glow = 1 }: { width?: number; height?: number; glow?: number }) {
  const padL = 14, padR = 60, padT = 14, padB = 28;
  const W = width, H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const total = PROJ.hist.length + PROJ.bull.length - 1;
  const allMax = Math.max(...PROJ.hist, ...PROJ.bull);
  const allMin = Math.min(...PROJ.hist, ...PROJ.bear);
  const yPad = (allMax - allMin) * 0.08;
  const yMax = allMax + yPad;
  const yMin = allMin - yPad;

  const x = (i: number) => padL + (i / (total - 1)) * innerW;
  const y = (val: number) => padT + (1 - (val - yMin) / (yMax - yMin)) * innerH;

  const histPath = PROJ.hist
    .map((val, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(val).toFixed(1)}`)
    .join(' ');

  const projOffset = PROJ.hist.length - 1;
  const linePath = (arr: number[]) =>
    arr.map((val, i) => `${i === 0 ? 'M' : 'L'} ${x(i + projOffset).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');

  const bandPath = [
    ...PROJ.bull.map((val, i) => `${i === 0 ? 'M' : 'L'} ${x(i + projOffset).toFixed(1)} ${y(val).toFixed(1)}`),
    ...PROJ.bear.slice().reverse().map((val, i, arr2) => `L ${x(arr2.length - 1 - i + projOffset).toFixed(1)} ${y(val).toFixed(1)}`),
    'Z',
  ].join(' ');

  const yTicks = 4;
  const yTickArr: { v: number; yPos: number }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = yMin + ((yMax - yMin) * i) / yTicks;
    yTickArr.push({ v: val, yPos: y(val) });
  }

  const labels = [
    { i: 0, t: 'Mar' },
    { i: Math.floor(total * 0.25), t: 'Apr' },
    { i: Math.floor(total * 0.5), t: 'May' },
    { i: projOffset, t: 'Today' },
    { i: Math.floor(total * 0.85), t: 'Jun' },
    { i: total - 1, t: 'Jul' },
  ];

  const fmt = (val: number) => '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });

  const todayX = x(projOffset);
  const todayY = y(PROJ.hist[PROJ.hist.length - 1]);

  const bullEnd = { xPos: x(total - 1), yPos: y(PROJ.bull[PROJ.bull.length - 1]) };
  const baseEnd = { xPos: x(total - 1), yPos: y(PROJ.base[PROJ.base.length - 1]) };
  const bearEnd = { xPos: x(total - 1), yPos: y(PROJ.bear[PROJ.bear.length - 1]) };

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bandFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.22 295)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="oklch(0.72 0.22 295)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="histFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0.20 145)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="oklch(0.86 0.20 145)" stopOpacity="0" />
        </linearGradient>
        <filter id="glowViolet" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={2.5 * glow} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={2 * glow} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g className="chart-grid">
        {yTickArr.map((t, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={t.yPos} y2={t.yPos} />
        ))}
      </g>

      {yTickArr.map((t, i) => (
        <text key={i} className="axis-text" x={W - padR + 6} y={t.yPos + 3}>{fmt(t.v)}</text>
      ))}

      {labels.map((l, i) => (
        <text key={i} className="axis-text" x={x(l.i)} y={H - 8} textAnchor="middle">{l.t}</text>
      ))}

      <path d={bandPath} fill="url(#bandFill)" />

      <path
        d={`${histPath} L ${x(projOffset).toFixed(1)} ${(H - padB).toFixed(1)} L ${padL.toFixed(1)} ${(H - padB).toFixed(1)} Z`}
        fill="url(#histFill)"
      />

      <path d={histPath} fill="none" stroke="oklch(0.86 0.20 145)" strokeWidth="1.6" filter="url(#glowGreen)" />
      <path d={linePath(PROJ.bull)} fill="none" stroke="oklch(0.86 0.20 145)" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.9" />
      <path d={linePath(PROJ.base)} fill="none" stroke="oklch(0.78 0.22 295)" strokeWidth="1.6" filter="url(#glowViolet)" />
      <path d={linePath(PROJ.bear)} fill="none" stroke="oklch(0.65 0.18 25)" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.85" />

      <line x1={todayX} x2={todayX} y1={padT} y2={H - padB} stroke="rgba(176,139,255,0.30)" strokeDasharray="3 3" />
      <circle cx={todayX} cy={todayY} r="4" fill="oklch(0.86 0.20 145)" stroke="#0a0a12" strokeWidth="2" filter="url(#glowGreen)" />

      <circle cx={bullEnd.xPos} cy={bullEnd.yPos} r="3" fill="oklch(0.86 0.20 145)" />
      <circle cx={baseEnd.xPos} cy={baseEnd.yPos} r="3" fill="oklch(0.78 0.22 295)" />
      <circle cx={bearEnd.xPos} cy={bearEnd.yPos} r="3" fill="oklch(0.65 0.18 25)" />
    </svg>
  );
}

export function Sparkline({ width = 110, height = 28, seed = 1, color = 'green' }: {
  width?: number; height?: number; seed?: number; color?: 'green' | 'violet' | 'red';
}) {
  const rnd = seededRand(seed);
  const N = 28;
  let v = 50;
  const arr: number[] = [];
  for (let i = 0; i < N; i++) {
    v += (rnd() - 0.45) * 6;
    arr.push(v);
  }
  const min = Math.min(...arr), max = Math.max(...arr);
  const xPos = (i: number) => (i / (N - 1)) * (width - 2) + 1;
  const yPos = (val: number) => height - 2 - ((val - min) / (max - min || 1)) * (height - 4);
  const path = arr.map((val, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(val).toFixed(1)}`).join(' ');
  const stroke = color === 'violet' ? 'oklch(0.78 0.22 295)' : color === 'red' ? 'oklch(0.7 0.20 25)' : 'oklch(0.86 0.20 145)';
  const fillId = `sparkFill_${seed}_${color}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${xPos(N - 1).toFixed(1)} ${height} L ${xPos(0).toFixed(1)} ${height} Z`} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}

interface DonutSegment { name: string; value: number; color: string; }

export function HoldingsDonut({ size = 160, segments, glow = 1 }: {
  size?: number; segments: DonutSegment[]; glow?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 12;
  const inner = r - 14;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = -Math.PI / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ filter: `drop-shadow(0 0 ${10 * glow}px oklch(0.6 0.22 295 / ${0.35 * glow}))` }}
    >
      <circle cx={cx} cy={cy} r={r + 1} fill="none" stroke="rgba(255,255,255,0.04)" />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const a0 = acc;
        const a1 = acc + frac * Math.PI * 2;
        acc = a1;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const x0i = cx + inner * Math.cos(a1), y0i = cy + inner * Math.sin(a1);
        const x1i = cx + inner * Math.cos(a0), y1i = cy + inner * Math.sin(a0);
        return (
          <path
            key={i}
            d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x0i} ${y0i} A ${inner} ${inner} 0 ${large} 0 ${x1i} ${y1i} Z`}
            fill={s.color}
            opacity="0.95"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={inner - 1} fill="none" stroke="rgba(255,255,255,0.04)" />
    </svg>
  );
}
