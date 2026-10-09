import { useEffect, useRef, useState } from 'react';

import { type ScenarioId, SCENARIOS } from '@/consts/scenarios';
import { cn } from '@/utils/cn';

const TAG_OFFSET_KEY = 'catoshi.scenarioTagOffset.';

/** A scenario badge the user can drag anywhere over the chart. The offset is
 * a translate from the badge's default slot, remembered per browser;
 * double-click puts it back. */
export function DraggableTag({ id, label }: { id: ScenarioId; label: string }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAG_OFFSET_KEY + id);
      if (raw) setOffset(JSON.parse(raw));
    } catch {
      // storage unavailable — default position
    }
  }, [id]);

  const save = (o: { x: number; y: number }) => {
    try {
      if (o.x === 0 && o.y === 0) localStorage.removeItem(TAG_OFFSET_KEY + id);
      else localStorage.setItem(TAG_OFFSET_KEY + id, JSON.stringify(o));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        'border-line-2 bg-bg/85 pointer-events-auto flex touch-none items-center gap-2 rounded-sm border px-2 py-1 font-mono text-xs whitespace-nowrap backdrop-blur-[6px] select-none max-sm:flex-auto max-sm:justify-center',
        scenario.textClass,
        dragging ? 'z-2 cursor-grabbing' : 'z-1 cursor-grab',
      )}
      title="Drag to move · double-click to reset"
      // Runtime drag offset.
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        setOffset({ x: s.ox + e.clientX - s.px, y: s.oy + e.clientY - s.py });
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
        save(offset);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => {
        const zero = { x: 0, y: 0 };
        setOffset(zero);
        save(zero);
      }}
    >
      <span className={cn('rounded-pill size-1.5', scenario.bgClass)}></span>
      {label}
    </div>
  );
}
