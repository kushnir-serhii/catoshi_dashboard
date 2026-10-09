import { MiniProjection } from './MiniProjection';

export type StepPreviewKind = 'collect' | 'forecast' | 'score';

const COLLECT_ROWS = [
  'RSI · 15m / 1h / 4h / 1d',
  'Funding · open interest',
  'ETF net flow · streak',
  'Fear & Greed index',
];

const SCORE_ROWS = [
  { l: 'Horizon elapsed', v: '60d' },
  { l: 'Realized scenario', v: 'base' },
  { l: 'Brier (multi-class)', v: '0.41' },
  { l: 'No-skill baseline', v: '0.67' },
];

export function StepPreview({ kind, glow = 1 }: { kind: StepPreviewKind; glow?: number }) {
  if (kind === 'collect') {
    return (
      <div className="flex w-full flex-col gap-2 p-4">
        {COLLECT_ROWS.map((label) => (
          <div
            key={label}
            className="text-text-2 flex items-center justify-between py-1 font-mono text-xs"
          >
            <span>{label}</span>
            <span className="text-green">● snapshotted</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'forecast') {
    return <MiniProjection glow={glow} />;
  }
  return (
    <div className="flex w-full flex-col gap-2 p-4">
      {SCORE_ROWS.map((s) => (
        <div key={s.l} className="text-text-2 flex justify-between font-mono text-xs">
          <span>{s.l}</span>
          <span className="text-text">{s.v}</span>
        </div>
      ))}
    </div>
  );
}
