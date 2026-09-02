'use client';

export type LogoVariant = 'tail' | 'ears' | 'mono';

const COLOR = 'oklch(0.78 0.22 295)';

function CatC_Tail({ size = 32, glow = 1 }: { size?: number; glow?: number }) {
  return (
    <span
      className="cat-logo"
      style={{ filter: `drop-shadow(0 0 ${6 * glow}px oklch(0.65 0.22 295 / ${0.5 * glow}))` }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path
          d="M25 9 A 10 10 0 1 0 25 23 Q 27 25 28.5 27.5 Q 25 26.5 23 24"
          stroke={COLOR}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24.4 8.6 L25.6 6.2 L26.6 9.0" fill={COLOR} />
      </svg>
    </span>
  );
}

function CatC_Ears({ size = 32, glow = 1 }: { size?: number; glow?: number }) {
  const maskId = `catC_open_${size}`;
  return (
    <span
      className="cat-logo"
      style={{ filter: `drop-shadow(0 0 ${6 * glow}px oklch(0.65 0.22 295 / ${0.5 * glow}))` }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <mask id={maskId}>
            <rect width="32" height="32" fill="white" />
            <path d="M16 16 L34 6 L34 26 Z" fill="black" />
            <circle cx="16" cy="17" r="4.4" fill="black" />
          </mask>
        </defs>
        <circle cx="16" cy="17" r="10" fill={COLOR} mask={`url(#${maskId})`} />
        <path d="M9 9 L8.2 4 L12.2 7.6 Z" fill={COLOR} />
        <path d="M23 9 L23.8 4 L19.8 7.6 Z" fill={COLOR} />
      </svg>
    </span>
  );
}

function CatC_Mono({ size = 32, glow = 1 }: { size?: number; glow?: number }) {
  return (
    <span
      className="cat-logo"
      style={{ filter: `drop-shadow(0 0 ${5 * glow}px oklch(0.65 0.22 295 / ${0.4 * glow}))` }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path
          d="M27 11 A 10 10 0 1 0 27 21 L 24 21 A 7 7 0 1 1 24 11 L 25.2 11 L 26.6 7.4 L 28 11 Z"
          fill={COLOR}
        />
        <circle cx="14" cy="16" r="1" fill="oklch(0.86 0.20 145)" />
      </svg>
    </span>
  );
}

export function Cat({
  variant = 'tail',
  size = 32,
  glow = 1,
}: {
  variant?: LogoVariant;
  size?: number;
  glow?: number;
}) {
  if (variant === 'ears') return <CatC_Ears size={size} glow={glow} />;
  if (variant === 'mono') return <CatC_Mono size={size} glow={glow} />;
  return <CatC_Tail size={size} glow={glow} />;
}

export function CatoshiWordmark({ size = 16 }: { size?: number }) {
  return (
    <span
      className="text-violet-light font-semibold"
      style={{ fontSize: size, lineHeight: 1, letterSpacing: '-0.01em', marginLeft: size * -0.7 }}
    >
      atoshi
    </span>
  );
}
