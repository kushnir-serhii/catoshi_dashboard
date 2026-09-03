'use client';

import { Surface } from '@heroui/react';
import Link from 'next/link';
import type { Signal } from '@/data/types';

interface SignalsPanelProps {
  items: Signal[];
}

export function SignalsPanel({ items }: SignalsPanelProps) {
  return (
    <Surface className="card area-signals padless" style={{ background: 'transparent', border: 0, padding: 0 }}>
      <div className="card-header" style={{ padding: '0 4px' }}>
        <div className="card-title"><span className="marker green"></span>Signals · last 24h</div>
        <Link href="/signals" className="btn-ghost">All signals →</Link>
      </div>
      <div className="signals">
        {items.map((s, i) => (
          <div className={`signal ${s.side}`} key={i}>
            <div className="head">
              <span className="tag">{s.tag}</span>
              <span className="src">{s.src}</span>
            </div>
            <h4>{s.title}</h4>
            <div className="foot">
              <span>{s.meta}</span>
              <span>↗ open</span>
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}
