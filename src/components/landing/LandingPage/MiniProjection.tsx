function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Static, non-interactive mini projection chart for the "How it works"
 * preview box. Purely decorative — unlike the dashboard's ProjectionChart it
 * has no scroll/zoom, and scales to its container via viewBox instead of
 * relying on measured pixel dimensions. */
export function MiniProjection({ glow = 1 }: { glow?: number }) {
  const W = 300;
  const H = 110;
  const MID = W * 0.42;
  const rnd = seededRand(11);

  const hist: [number, number][] = [];
  let v = 60;
  for (let i = 0; i <= 12; i++) {
    v += (rnd() - 0.42) * 8;
    hist.push([(i / 12) * MID, H * 0.62 - v * 0.35]);
  }
  const last = hist[hist.length - 1];

  const project = (drift: number): [number, number][] => {
    const pts: [number, number][] = [last];
    let y = last[1];
    for (let i = 1; i <= 10; i++) {
      y -= drift + (rnd() - 0.5) * 5;
      pts.push([MID + (i / 10) * (W - MID), y]);
    }
    return pts;
  };
  const bull = project(3.4);
  const base = project(1.2);
  const bear = project(-0.6);

  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  const bandPath =
    toPath(bull) +
    ' L ' +
    bear
      .slice()
      .reverse()
      .map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' L ') +
    ' Z';

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block"
      // Dynamic: glow strength is a runtime prop.
      style={{ filter: `drop-shadow(0 0 ${6 * glow}px oklch(0.6 0.22 295 / ${0.25 * glow}))` }}
    >
      <path d={bandPath} fill="var(--color-chart-base-fill)" stroke="none" />
      <line
        x1={MID}
        y1={4}
        x2={MID}
        y2={H - 4}
        stroke="var(--color-chart-base)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.6}
      />
      <path d={toPath(hist)} fill="none" stroke="var(--color-chart-bull)" strokeWidth={1.6} />
      <path
        d={toPath(bull)}
        fill="none"
        stroke="var(--color-chart-bull)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
        opacity={0.9}
      />
      <path d={toPath(base)} fill="none" stroke="var(--color-chart-base)" strokeWidth={1.6} />
      <path
        d={toPath(bear)}
        fill="none"
        stroke="var(--color-chart-bear)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
        opacity={0.9}
      />
    </svg>
  );
}
