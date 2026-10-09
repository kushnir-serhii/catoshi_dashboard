interface ConfidenceGaugeProps {
  /** 0–100. */
  confidence: number;
}

export function ConfidenceGauge({ confidence }: ConfidenceGaugeProps) {
  return (
    <div className="rounded-pill bg-surface-3 relative mt-3 h-1 overflow-hidden" aria-hidden="true">
      <div
        className="rounded-pill h-full bg-[linear-gradient(90deg,var(--color-violet),var(--color-green))] shadow-[0_0_var(--glow-sm)_var(--color-violet)]"
        style={{ width: `${confidence}%` }}
      />
    </div>
  );
}
