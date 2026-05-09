'use client';

import { useState } from 'react';
import { ProjectionChart, Sparkline, HoldingsDonut } from './charts';

export function KPIs() {
  const items = [
    { lbl: 'Portfolio value',  val: '$248,392.41', sparkSeed: 4,  sparkColor: 'green'  as const, deltaText: '+ $12,409', deltaClass: 'delta-up mono', subText: 'last 30d' },
    { lbl: '90-day projection', val: '$291,400',   sparkSeed: 11, sparkColor: 'violet' as const, deltaText: '+ 17.3%',  deltaClass: 'delta-up mono', subText: 'base case' },
    { lbl: 'Risk score',        val: '6.2 / 10',  sparkSeed: 19, sparkColor: 'violet' as const, deltaText: 'moderate', deltaClass: 'muted',         subText: 'σ 0.34' },
    { lbl: 'AI confidence',     val: '74%',        sparkSeed: 27, sparkColor: 'green'  as const, deltaText: '+ 3.1pt',  deltaClass: 'delta-up mono', subText: 'last cycle' },
  ];
  return (
    <div className="card padless area-kpis">
      <div className="kpis">
        {items.map((k, i) => (
          <div className="kpi" key={i}>
            <div className="lbl">{k.lbl}</div>
            <div className="val tnum">{k.val}</div>
            <div className="sub">
              <span className={k.deltaClass}>{k.deltaText}</span>
              <span className="muted">{k.subText}</span>
            </div>
            <div className="micro">
              <Sparkline width={70} height={28} seed={k.sparkSeed} color={k.sparkColor} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartPanel({ glow }: { glow: number }) {
  const [range, setRange] = useState('3M');
  return (
    <div className="card glow-violet area-chart">
      <div className="card-header">
        <div className="row" style={{ gap: 14 }}>
          <div className="card-title">
            <span className="marker"></span>Portfolio projection · 60-day forecast
          </div>
        </div>
        <div className="row">
          <div className="legend">
            <span><span className="sw" style={{ background: 'oklch(0.86 0.20 145)' }}></span>Bull case</span>
            <span><span className="sw" style={{ background: 'oklch(0.78 0.22 295)' }}></span>Base case</span>
            <span><span className="sw" style={{ background: 'oklch(0.65 0.18 25)' }}></span>Bear case</span>
          </div>
          <div className="chart-tabs">
            {['1W', '1M', '3M', '6M', '1Y', 'All'].map((r) => (
              <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="row chart-price-row" style={{ alignItems: 'baseline', gap: 18, marginBottom: 6 }}>
        <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em' }} className="tnum glow-text-violet">
          $248,392.41
        </div>
        <div className="mono delta-up">+ $12,409.22 · 5.26%</div>
        <div className="muted small">vs 30 days ago</div>
        <div className="right">
          <button className="btn-ghost">Export forecast</button>
        </div>
      </div>
      <div className="chart-stage">
        <ProjectionChart width={820} height={320} glow={glow} />
        <div className="scenario-tag" style={{ top: 18, right: 78 }}>
          <span className="dot" style={{ background: 'oklch(0.86 0.20 145)' }}></span>
          Bull · $314.8K · +27%
        </div>
        <div className="scenario-tag" style={{ top: 130, right: 78 }}>
          <span className="dot" style={{ background: 'oklch(0.78 0.22 295)' }}></span>
          Base · $291.4K · +17%
        </div>
        <div className="scenario-tag" style={{ top: 232, right: 78 }}>
          <span className="dot" style={{ background: 'oklch(0.65 0.18 25)' }}></span>
          Bear · $232.1K · –7%
        </div>
      </div>
    </div>
  );
}

export function AIPanel({ glow: _glow }: { glow: number }) {
  const preds = [
    { sym: 'BTC',  name: 'Bitcoin',   target: '$78,420', delta: '+12.4%', conf: 81, horizon: '60D', from: '$69,750' },
    { sym: 'ETH',  name: 'Ethereum',  target: '$4,890',  delta: '+18.1%', conf: 74, horizon: '60D', from: '$4,140' },
    { sym: 'SOL',  name: 'Solana',    target: '$284',    delta: '+9.6%',  conf: 68, horizon: '60D', from: '$259' },
    { sym: 'TAO',  name: 'Bittensor', target: '$612',    delta: '+34.2%', conf: 52, horizon: '60D', from: '$456' },
  ];
  return (
    <div className="card area-ai" style={{ display: 'flex', flexDirection: 'column' }}>
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
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="scen-row">
      <div className="lbl">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--p': pct + '%' } as React.CSSProperties}
      />
      <div className="val mono">{format ? format(value) : value}</div>
    </div>
  );
}

export function ScenarioPanel() {
  const [horizon, setHorizon] = useState(60);
  const [btcPct, setBtcPct] = useState(45);
  const [vol, setVol] = useState(35);
  const [drift, setDrift] = useState(2);

  const start = 248392;
  const r = drift / 100;
  const sig = vol / 100;
  const t = horizon / 365;
  const base = start * Math.exp(r * t);
  const bull = base * Math.exp(sig * Math.sqrt(t));
  const bear = base * Math.exp(-sig * Math.sqrt(t));
  const fmtUsd = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

  return (
    <div className="card area-scen">
      <div className="card-header">
        <div className="card-title"><span className="marker"></span>Scenario simulator</div>
        <button className="btn-ghost">Save as preset</button>
      </div>
      <Slider label="Horizon"      value={horizon} min={7}   max={365} onChange={setHorizon} format={(v) => `${v}d`} />
      <Slider label="BTC weight"   value={btcPct}  min={0}   max={100} onChange={setBtcPct}  format={(v) => `${v}%`} />
      <Slider label="Volatility σ" value={vol}     min={5}   max={80}  onChange={setVol}     format={(v) => `${v}%`} />
      <Slider label="Annual drift" value={drift}   min={-15} max={20}  step={0.5} onChange={setDrift}
        format={(v) => `${v > 0 ? '+' : ''}${v}%`} />
      <div className="scen-result">
        <div className="cell bear">
          <div className="lbl">Bear · 5%</div>
          <div className="val tnum">{fmtUsd(bear)}</div>
        </div>
        <div className="cell base">
          <div className="lbl">Base · 50%</div>
          <div className="val tnum glow-text-violet">{fmtUsd(base)}</div>
        </div>
        <div className="cell bull">
          <div className="lbl">Bull · 95%</div>
          <div className="val tnum glow-text-green">{fmtUsd(bull)}</div>
        </div>
      </div>
    </div>
  );
}

export function WatchlistPanel() {
  const rows = [
    { sym: 'BTC',  name: 'Bitcoin',   price: '$69,750.40', d24: '+1.84%', up: true,  proj: '+12.4%', side: 'bull', spark: 3 },
    { sym: 'ETH',  name: 'Ethereum',  price: '$4,140.18',  d24: '+2.62%', up: true,  proj: '+18.1%', side: 'bull', spark: 7 },
    { sym: 'SOL',  name: 'Solana',    price: '$259.04',    d24: '–0.78%', up: false, proj: '+9.6%',  side: 'bull', spark: 9 },
    { sym: 'LINK', name: 'Chainlink', price: '$22.41',     d24: '+0.41%', up: true,  proj: '+6.2%',  side: 'bull', spark: 13 },
    { sym: 'ARB',  name: 'Arbitrum',  price: '$1.04',      d24: '–2.12%', up: false, proj: '–4.1%',  side: 'bear', spark: 17 },
    { sym: 'TAO',  name: 'Bittensor', price: '$456.20',    d24: '+5.20%', up: true,  proj: '+34.2%', side: 'bull', spark: 21 },
  ];
  return (
    <div className="card area-watch">
      <div className="card-header">
        <div className="card-title"><span className="marker green"></span>Watchlist · 60-day projection</div>
        <button className="btn-ghost">Manage list</button>
      </div>
      <div className="tbl-wrap"><table className="watch-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>24h</th>
            <th>Trend</th>
            <th style={{ textAlign: 'right' }}>Projection</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <div className="sym">
                  <div className={`coin-mark ${row.sym.toLowerCase()}`}>{row.sym.slice(0, 1)}</div>
                  <div>
                    <div>{row.sym}</div>
                    <div className="name">{row.name}</div>
                  </div>
                </div>
              </td>
              <td className="tnum" style={{ textAlign: 'right' }}>{row.price}</td>
              <td className="delta mono" style={{ textAlign: 'right' }}>
                <span className={row.up ? 'delta-up' : 'delta-dn'}>{row.d24}</span>
              </td>
              <td>
                <Sparkline width={90} height={24} seed={row.spark} color={row.up ? 'green' : 'red'} />
              </td>
              <td className="mono" style={{ textAlign: 'right' }}>
                <span className={row.side === 'bull' ? 'delta-up' : 'delta-dn'}>{row.proj}</span>
              </td>
              <td>
                <div className="proj-bar">
                  <div className="center"></div>
                  <div
                    className={`fill ${row.side === 'bull' ? 'green' : ''}`}
                    style={{
                      left: row.side === 'bull' ? '50%' : `${50 - parseFloat(row.proj) * -2}%`,
                      width: `${Math.min(40, Math.abs(parseFloat(row.proj)) * 2)}%`,
                    }}
                  ></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

export function HoldingsPanel({ glow }: { glow: number }) {
  const segments = [
    { name: 'BTC',  value: 42, color: 'oklch(0.78 0.22 295)' },
    { name: 'ETH',  value: 28, color: 'oklch(0.86 0.20 145)' },
    { name: 'SOL',  value: 14, color: 'oklch(0.62 0.22 295)' },
    { name: 'TAO',  value: 9,  color: 'oklch(0.55 0.20 145)' },
    { name: 'Cash', value: 7,  color: 'oklch(0.40 0.04 280)' },
  ];
  return (
    <div className="card area-holdings">
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
            <div className="val">${Math.round(248392 * s.value / 100).toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignalsPanel() {
  const items = [
    { side: 'bullish', tag: 'BULLISH', src: 'On-chain · BTC',   title: 'Whale accumulation up 14% w/w; supply on exchanges hits 5y low.', meta: '4 sources · 2h ago' },
    { side: 'bullish', tag: 'BULLISH', src: 'Macro',            title: 'Real yields trending down. Risk-on assets gaining bid.',          meta: 'Reuters · 5h ago' },
    { side: 'bearish', tag: 'BEARISH', src: 'Sentiment · SOL',  title: 'Funding rates compressing after 9d positive streak.',            meta: 'Coinglass · 1h ago' },
    { side: 'neutral', tag: 'NEUTRAL', src: 'Technicals · ETH', title: 'Pinned at $4.1K resistance; 50/200 EMA cross pending.',          meta: 'Auto · 30m ago' },
  ];
  return (
    <div className="card area-signals padless" style={{ background: 'transparent', border: 0, padding: 0 }}>
      <div className="card-header" style={{ padding: '0 4px' }}>
        <div className="card-title"><span className="marker green"></span>Signals · last 24h</div>
        <button className="btn-ghost">All signals →</button>
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
    </div>
  );
}
