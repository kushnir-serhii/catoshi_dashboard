export function XTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (!payload?.value) return null;
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" className="fill-text-3 font-mono text-xs">
      {payload.value}
    </text>
  );
}
