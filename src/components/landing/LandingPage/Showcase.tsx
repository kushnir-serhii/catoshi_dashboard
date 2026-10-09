import { ProjectionChart, Sparkline } from '@/components/dashboard/charts';
import { cn } from '@/utils/cn';

import { ShowcasePrediction } from './ShowcasePrediction';

const KPIS = [
  { lbl: 'Base case · 60d', val: '+8.4%', c: 'violet' as const },
  { lbl: 'Bull case', val: '+21.6%', c: 'green' as const },
  { lbl: 'Bear case', val: '−12.1%', c: 'red' as const },
  { lbl: 'Model confidence', val: '72%', c: 'violet' as const },
];

const PREDS = [
  { sym: 'BTC', target: '$105,200', delta: '+8.4%', conf: 72 },
  { sym: 'ETH', target: '$3,240', delta: '+11.0%', conf: 66 },
  { sym: 'SOL', target: '$168', delta: '+6.2%', conf: 58 },
];

const FRAME_DOTS = ['bg-[#ff6058]', 'bg-[#ffbe2f]', 'bg-[#28cd41]'];

const LEGEND = [
  { label: 'Bull', swatch: 'bg-chart-bull' },
  { label: 'Base', swatch: 'bg-chart-base' },
  { label: 'Bear', swatch: 'bg-chart-bear' },
];

export function Showcase({ glow }: { glow: number }) {
  return (
    <div className="hero-showcase">
      <div className="frame-bar">
        {FRAME_DOTS.map((bg) => (
          <div key={bg} className={cn('dot', bg)}></div>
        ))}
        <div className="url">catoshi · projections (sample)</div>
      </div>
      <div className="showcase-body">
        <div className="mb-4">
          <div className="kpis border-line bg-surface overflow-hidden rounded-lg border">
            {KPIS.map((k, i) => (
              <div className="kpi" key={k.lbl}>
                <div className="lbl">{k.lbl}</div>
                <div className="val tnum">{k.val}</div>
                <div className="sub">
                  <span className={k.c === 'green' ? 'delta-up mono' : 'muted'}>sample</span>
                </div>
                <div className="micro">
                  <Sparkline width={70} height={28} seed={i * 9 + 4} color={k.c} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <div className="card glow-violet p-4">
            <div className="card-header mb-2">
              <div className="card-title">
                <span className="marker"></span>BTC · base case · 60d
              </div>
              <div className="legend">
                {LEGEND.map((l) => (
                  <span key={l.label}>
                    <span className={cn('sw', l.swatch)}></span>
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-60">
              <ProjectionChart width={680} height={240} glow={glow} interactive={false} />
            </div>
          </div>
          <div className="card p-4">
            <div className="card-header mb-3">
              <div className="card-title">
                <span className="marker green"></span>Model predictions
              </div>
            </div>
            {PREDS.map((p) => (
              <ShowcasePrediction key={p.sym} {...p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
