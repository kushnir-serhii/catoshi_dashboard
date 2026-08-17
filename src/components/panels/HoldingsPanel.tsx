'use client';

import { Surface } from '@heroui/react';
import { HoldingsDonut } from '@/components/dashboard/charts';
import type { HoldingSegment } from '@/data/types';

interface HoldingsPanelProps {
  glow: number;
  segments: HoldingSegment[];
}

export function HoldingsPanel({ glow, segments }: HoldingsPanelProps) {
  const total = 248392;
  return (
    <Surface className="card area-holdings">
      <div className="card-header">
        <div className="card-title"><span className="marker"></span>Holdings</div>
        <button className="btn-ghost">Rebalance</button>
      </div>
      <div className="holdings-donut">
        <HoldingsDonut size={160} segments={segments} glow={glow} />
        <div className="center">
          <div>
            <div className="lbl">TOTAL</div>
            <div className="val tnum glow-text-violet">$248K</div>
          </div>
        </div>
      </div>
      <div className="holdings-list">
        {segments.map((s, i) => (
          <div className="holdings-row" key={i}>
            <div className="left">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }}></span>
              <span>{s.name}</span>
            </div>
            <div className="pct">{s.value}%</div>
            <div className="val">${Math.round(total * s.value / 100).toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>
    </Surface>
  );
}
