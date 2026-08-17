'use client';

import { Surface } from '@heroui/react';
import type { AiPred } from '@/data/types';

interface AIPanelProps {
  glow?: number;
  preds: AiPred[];
}

export function AIPanel({ preds }: AIPanelProps) {
  return (
    <Surface className="card area-ai" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-header">
        <div className="card-title"><span className="marker green"></span>Model predictions</div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>v3.2 · 14:02 UTC</span>
      </div>
      <p className="ai-headline">
        Ensemble of <strong>5 models</strong> on 18 months of on-chain + price data. Latest forward pass favors <strong>L1 majors</strong> with rotation into <strong>AI-coin</strong> mid-caps.
      </p>
      {preds.map((p, i) => (
        <div className="ai-pred" key={i}>
          <div className="pair">
            <div className="row">
              <div className={`coin-mark ${p.sym.toLowerCase()}`}>{p.sym.slice(0, 1)}</div>
              <div>
                <div className="sym">{p.sym}</div>
                <div className="muted small">{p.name} · {p.horizon}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="target tnum glow-text-violet">{p.target}</div>
              <div className="mono delta-up small">{p.delta}</div>
            </div>
          </div>
          <div className="gauge" aria-hidden="true">
            <div className="fill" style={{ width: `${p.conf}%` }}></div>
          </div>
          <div className="meta">
            <span>From {p.from}</span>
            <span>Confidence {p.conf}%</span>
          </div>
        </div>
      ))}
    </Surface>
  );
}
