'use client';

import { useState } from 'react';
import { Surface } from '@heroui/react';

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
    <Surface className="card area-scen">
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
    </Surface>
  );
}
