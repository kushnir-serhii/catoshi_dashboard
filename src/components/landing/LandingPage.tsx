'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ProjectionChart, Sparkline } from '@/components/dashboard/charts';
import type { LogoVariant } from '@/components/ui/CatLogo';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';

import { FaqSection } from './FaqSection';

const APP_HREF = '/projections';

function Showcase({ glow }: { glow: number }) {
  const kpis = [
    { lbl: 'Base case · 60d', val: '+8.4%', c: 'violet' as const },
    { lbl: 'Bull case', val: '+21.6%', c: 'green' as const },
    { lbl: 'Bear case', val: '−12.1%', c: 'red' as const },
    { lbl: 'Model confidence', val: '72%', c: 'violet' as const },
  ];
  const preds = [
    { sym: 'BTC', target: '$105,200', delta: '+8.4%', conf: 72 },
    { sym: 'ETH', target: '$3,240', delta: '+11.0%', conf: 66 },
    { sym: 'SOL', target: '$168', delta: '+6.2%', conf: 58 },
  ];
  return (
    <div className="hero-showcase">
      <div className="frame-bar">
        <div className="dot" style={{ background: '#ff6058' }}></div>
        <div className="dot" style={{ background: '#ffbe2f' }}></div>
        <div className="dot" style={{ background: '#28cd41' }}></div>
        <div className="url">catoshi · projections (sample)</div>
      </div>
      <div className="showcase-body">
        <div style={{ marginBottom: 14 }}>
          <div
            className="kpis"
            style={{
              border: '1px solid var(--line)',
              borderRadius: 14,
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            {kpis.map((k, i) => (
              <div className="kpi" key={i}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14 }}>
          <div className="card glow-violet" style={{ padding: 16 }}>
            <div className="card-header" style={{ marginBottom: 8 }}>
              <div className="card-title">
                <span className="marker"></span>BTC · base case · 60d
              </div>
              <div className="legend">
                <span>
                  <span className="sw" style={{ background: 'oklch(0.86 0.20 145)' }}></span>Bull
                </span>
                <span>
                  <span className="sw" style={{ background: 'oklch(0.78 0.22 295)' }}></span>Base
                </span>
                <span>
                  <span className="sw" style={{ background: 'oklch(0.65 0.18 25)' }}></span>Bear
                </span>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <ProjectionChart width={680} height={240} glow={glow} interactive={false} />
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">
                <span className="marker green"></span>Model predictions
              </div>
            </div>
            {preds.map((p, i) => (
              <div className="ai-pred" key={i} style={{ padding: 10, marginBottom: 8 }}>
                <div className="pair" style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      className={`coin-mark ${p.sym.toLowerCase()}`}
                      style={{ width: 22, height: 22, fontSize: 9 }}
                    >
                      {p.sym.slice(0, 1)}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                      }}
                    >
                      {p.sym}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum mono" style={{ fontSize: 14 }}>
                      {p.target}
                    </div>
                    <div className="delta-up mono" style={{ fontSize: 10 }}>
                      {p.delta}
                    </div>
                  </div>
                </div>
                <div className="gauge">
                  <div className="fill" style={{ width: `${p.conf}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Static, non-interactive mini projection chart for the "How it works"
 * preview box. Purely decorative — unlike the dashboard's ProjectionChart it
 * has no scroll/zoom, and scales to its container via viewBox instead of
 * relying on measured pixel dimensions. */
function MiniProjection({ glow = 1 }: { glow?: number }) {
  const W = 300;
  const H = 110;
  const MID = W * 0.42;
  const rnd = seededRand(11);

  const hist: [number, number][] = [];
  let v = 60;
  for (let i = 0; i <= 12; i++) {
    v += (rnd() - 0.42) * 8;
    hist.push([(i / 12) * MID, H * 0.62 - v * 0.35]);
  }
  const last = hist[hist.length - 1];

  const project = (drift: number): [number, number][] => {
    const pts: [number, number][] = [last];
    let y = last[1];
    for (let i = 1; i <= 10; i++) {
      y -= drift + (rnd() - 0.5) * 5;
      pts.push([MID + (i / 10) * (W - MID), y]);
    }
    return pts;
  };
  const bull = project(3.4);
  const base = project(1.2);
  const bear = project(-0.6);

  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  const bandPath =
    toPath(bull) +
    ' L ' +
    bear
      .slice()
      .reverse()
      .map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' L ') +
    ' Z';

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{
        display: 'block',
        filter: `drop-shadow(0 0 ${6 * glow}px oklch(0.6 0.22 295 / ${0.25 * glow}))`,
      }}
    >
      <path d={bandPath} fill="oklch(0.78 0.22 295 / 0.10)" stroke="none" />
      <line
        x1={MID}
        y1={4}
        x2={MID}
        y2={H - 4}
        stroke="oklch(0.78 0.22 295)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.6}
      />
      <path d={toPath(hist)} fill="none" stroke="oklch(0.86 0.20 145)" strokeWidth={1.6} />
      <path
        d={toPath(bull)}
        fill="none"
        stroke="oklch(0.86 0.20 145)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
        opacity={0.9}
      />
      <path d={toPath(base)} fill="none" stroke="oklch(0.78 0.22 295)" strokeWidth={1.6} />
      <path
        d={toPath(bear)}
        fill="none"
        stroke="oklch(0.65 0.18 25)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
        opacity={0.9}
      />
    </svg>
  );
}

function StepPreview({
  kind,
  glow = 1,
}: {
  kind: 'collect' | 'forecast' | 'score';
  glow?: number;
}) {
  if (kind === 'collect') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: 16 }}>
        {[
          ['RSI · 15m / 1h / 4h / 1d', 'ok'],
          ['Funding · open interest', 'ok'],
          ['ETF net flow · streak', 'ok'],
          ['Fear & Greed index', 'ok'],
        ].map(([label], i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-2)',
              padding: '4px 0',
            }}
          >
            <span>{label}</span>
            <span style={{ color: 'var(--green)' }}>● snapshotted</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'forecast') {
    return <MiniProjection glow={glow} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: 16 }}>
      {[
        { l: 'Horizon elapsed', v: '60d' },
        { l: 'Realized scenario', v: 'base' },
        { l: 'Brier (multi-class)', v: '0.41' },
        { l: 'No-skill baseline', v: '0.67' },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)',
          }}
        >
          <span>{s.l}</span>
          <span style={{ color: 'var(--text)' }}>{s.v}</span>
        </div>
      ))}
    </div>
  );
}

const LOGO_VARIANT: LogoVariant = 'ears';

const ADVICE_NOTE = 'Projections are scenarios, not predictions. Nothing here is financial advice.';

export function LandingPage() {
  const [glow] = useState(1);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', String(glow));
  }, [glow]);

  const features = [
    {
      num: '01',
      title: 'Scenario projections',
      body: 'Bull, base and bear price curves for BTC, ETH and SOL, each carrying a probability and the model’s written rationale. Scenarios, not predictions.',
      green: false,
      wide: false,
    },
    {
      num: '02',
      title: 'One model, one call',
      body: 'Each forecast is a single call to a language model through a provider abstraction — Claude or GPT, selectable per run. No ensemble and no undisclosed weighting.',
      green: true,
      wide: false,
    },
    {
      num: '03',
      title: 'Scenario simulator',
      body: 'Adjust horizon, volatility and drift and watch the bear / base / bull outcome re-price against the selected coin’s spot. Volatility and drift are seeded from that coin’s own realized history.',
      green: false,
      wide: false,
    },
    {
      num: '04',
      title: 'Market-state signals',
      body: 'Bullish, bearish and neutral signals from deterministic rules over each hourly snapshot — RSI, funding, open interest, ETF streaks, volume, moving-average compression and Fear & Greed. No language model, no social scraping; ordered by severity.',
      green: false,
      wide: false,
    },
    {
      num: '05',
      title: 'Measured, not asserted',
      body: 'The Models page reports only resolved-forecast accuracy: a multi-category Brier score against the no-skill baseline, grouped by model and prompt version, with an explicit empty state below the minimum sample size.',
      green: false,
      wide: true,
    },
  ];

  const steps: Array<{
    num: string;
    title: string;
    body: string;
    kind: 'collect' | 'forecast' | 'score';
  }> = [
    {
      num: '01 ↗',
      title: 'Collect',
      body: 'Every hour a scheduled job snapshots the market state for BTC, ETH and SOL — indicators across four timeframes, derivatives positioning, ETF flows and Fear & Greed — and writes one row per asset to Postgres.',
      kind: 'collect',
    },
    {
      num: '02 ↗',
      title: 'Forecast',
      body: 'One language-model call turns the latest snapshot into bull, base and bear curves with scenario probabilities and a rationale. The model and prompt version are stored with every forecast.',
      kind: 'forecast',
    },
    {
      num: '03 ↗',
      title: 'Score',
      body: 'When a forecast’s horizon elapses, the real price is fetched, the scenario that actually happened is recorded, and a multi-category Brier score is written — grouped by model and prompt version.',
      kind: 'score',
    },
  ];

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="land-nav">
        <div className="brand-flex">
          <Cat variant={LOGO_VARIANT} size={26} glow={glow} />
          <CatoshiWordmark size={16} />
        </div>
        <div className="land-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="land-nav-cta">
          <Link href={APP_HREF} className="btn-cta" style={{ padding: '10px 16px', fontSize: 13 }}>
            Open dashboard →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="eyebrow">
          <span className="dot"></span>
          Forecasting and signals for BTC · ETH · SOL
        </div>
        <h1>
          Crypto projections,
          <br />
          with the math that <span className="neon-violet">matters</span>{' '}
          <span className="neon-green">most.</span>
        </h1>
        <p className="lede">
          Catoshi snapshots the market every hour, turns each snapshot into bull / base / bear
          scenarios with a single language-model call, and scores every forecast against the price
          that actually printed.
        </p>
        <p className="lede" style={{ fontSize: 'var(--fs-sm)', marginTop: -18 }}>
          <em>{ADVICE_NOTE}</em>
        </p>
        <div className="hero-cta">
          <Link href={APP_HREF} className="btn-cta">
            Open the dashboard →
          </Link>
          <a href="#how" className="btn-cta-ghost">
            See how it works
          </a>
        </div>
        <div className="hero-meta">
          <span>
            <span className="ok">●</span> No sign-up
          </span>
          <span>
            <span className="ok">●</span> Nothing to connect
          </span>
          <span>
            <span className="ok">●</span> BTC · ETH · SOL
          </span>
        </div>
        <Showcase glow={glow} />
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="section-head">
          <div className="kicker">PRODUCT</div>
          <h2>What the product actually does.</h2>
          <p>Every capability below is produced by code in this repository. {ADVICE_NOTE}</p>
        </div>
        <div className="features">
          {features.map((f, i) => (
            <div
              key={i}
              className={['feature', f.green && 'green', f.wide && 'wide']
                .filter(Boolean)
                .join(' ')}
            >
              <div className="icon">{f.num}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how">
        <div className="section-head">
          <div className="kicker">HOW IT WORKS</div>
          <h2>Collect, forecast, score.</h2>
          <p>
            An hourly job, one model call, and a scoring pass that grades each forecast against the
            real price. {ADVICE_NOTE}
          </p>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <div key={i} className="step">
              <span className="num">{s.num}</span>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
              <div className="preview">
                <StepPreview kind={s.kind} glow={glow} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <FaqSection />

      {/* Final CTA */}
      <section className="section">
        <div className="final-cta">
          <h2>See the current projections.</h2>
          <p>Open the dashboard — no sign-up, nothing to connect. {ADVICE_NOTE}</p>
          <div className="hero-cta">
            <Link href={APP_HREF} className="btn-cta">
              Open the dashboard →
            </Link>
            <a href="#faq" className="btn-cta-ghost">
              Read the FAQ
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div style={{ flex: '0 0 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Cat variant={LOGO_VARIANT} size={26} glow={glow} />
            <CatoshiWordmark size={16} />
          </div>
          <p className="small muted" style={{ lineHeight: 1.6, margin: 0 }}>
            Forecasting and signals that show their work.
          </p>
        </div>
        <div className="col">
          <h5>Dashboard</h5>
          <Link href="/projections">Projections</Link>
          <Link href="/signals">Signals</Link>
          <Link href="/models">Models</Link>
          <a href="#faq">FAQ</a>
        </div>
        <div className="copy">
          © 2026 Catoshi · Crypto involves risk. Projections are statistical, not guaranteed. Not
          financial advice.
        </div>
      </footer>
    </div>
  );
}
