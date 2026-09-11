/**
 * Loading placeholder for the projection charts.
 *
 * A flat grey rectangle reads as a broken page rather than a loading one, and
 * at 320px tall it is a lot of nothing. This draws the shape the real chart is
 * about to have — gridlines, a history line, the "today" divider and the
 * bull/base/bear fan — so the wait looks like loading.
 *
 * The drawing is decorative and hidden from assistive tech; the wrapper
 * announces the state instead.
 */
export function ChartSkeleton({ height = 320 }: { height?: number }) {
  const stroke = {
    fill: 'none',
    strokeWidth: 2,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <div
      role="status"
      aria-label="Loading chart"
      className="animate-pulse"
      style={{
        height,
        borderRadius: 'var(--radius)',
        background: 'var(--color-surface-2)',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 800 320"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
      >
        {[64, 128, 192, 256].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="800"
            y2={y}
            stroke="var(--color-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* history */}
        <path
          d="M0 252 L100 238 L200 246 L300 212 L400 186"
          stroke="var(--color-surface-3)"
          {...stroke}
        />

        {/* today */}
        <line
          x1="400"
          y1="24"
          x2="400"
          y2="296"
          stroke="var(--color-line-2)"
          strokeWidth="1"
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />

        {/* forecast fan */}
        <path d="M400 186 L800 104" stroke="var(--color-surface-3)" strokeDasharray="5 7" {...stroke} />
        <path d="M400 186 L800 182" stroke="var(--color-surface-3)" strokeDasharray="5 7" {...stroke} />
        <path d="M400 186 L800 258" stroke="var(--color-surface-3)" strokeDasharray="5 7" {...stroke} />
      </svg>
    </div>
  );
}
