interface ConfidenceBarProps {
  conf: number;
}

export function ConfidenceBar({ conf }: ConfidenceBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-pill bg-surface-3 h-1 flex-1">
        <div
          className="rounded-pill h-full bg-[linear-gradient(90deg,var(--color-violet),var(--color-green))] shadow-[0_0_var(--glow-sm)_var(--color-violet)]"
          style={{ width: `${conf}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-sm leading-(--lh-normal)">{conf}</span>
    </div>
  );
}
