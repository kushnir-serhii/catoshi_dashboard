interface ShowcasePredictionProps {
  sym: string;
  target: string;
  delta: string;
  conf: number;
}

export function ShowcasePrediction({ sym, target, delta, conf }: ShowcasePredictionProps) {
  return (
    <div className="ai-pred mb-2 p-3">
      <div className="pair mb-2">
        <div className="flex items-center gap-2">
          <div className={`coin-mark ${sym.toLowerCase()} size-5.5 text-xs`}>{sym.slice(0, 1)}</div>
          <div className="font-mono text-sm">{sym}</div>
        </div>
        <div className="text-right">
          <div className="tnum mono text-sm">{target}</div>
          <div className="delta-up mono text-xs">{delta}</div>
        </div>
      </div>
      <div className="gauge">
        {/* Dynamic: width comes from the confidence value. */}
        <div className="fill" style={{ width: `${conf}%` }}></div>
      </div>
    </div>
  );
}
