import { fmtYAxis } from './utils';

export function YTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (!payload) return null;
  return (
    <text x={(x ?? 0) + 4} y={(y ?? 0) + 4} className="fill-text-3 font-mono text-xs">
      {fmtYAxis(payload.value)}
    </text>
  );
}
