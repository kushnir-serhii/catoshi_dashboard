'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { ProjectionChart, Sparkline } from '@/components/dashboard/charts';
import type { LogoVariant } from '@/components/ui/CatLogo';

const APP_HREF = '/';

function Showcase({ glow }: { glow: number }) {
  const kpis = [
    { lbl: 'Portfolio', val: '$248,392', sub: '+5.26%', c: 'green' as const },
    { lbl: '90d projection', val: '$291,400', sub: '+17.3%', c: 'violet' as const },
    { lbl: 'AI confidence', val: '74%', sub: 'v3.2', c: 'green' as const },
    { lbl: 'Risk', val: '6.2/10', sub: 'moderate', c: 'violet' as const },
  ];
  const preds = [
    { sym: 'BTC', target: '$78,420', delta: '+12.4%', conf: 81 },
    { sym: 'ETH', target: '$4,890', delta: '+18.1%', conf: 74 },
    { sym: 'TAO', target: '$612', delta: '+34.2%', conf: 52 },
  ];
  return (
    <div className="hero-showcase">
      <div className="frame-bar">
        <div className="dot" style={{ background: '#ff6058' }}></div>
        <div className="dot" style={{ background: '#ffbe2f' }}></div>
        <div className="dot" style={{ background: '#28cd41' }}></div>
        <div className="url">app.catoshi.ai/projections</div>
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
                  <span className={k.c === 'green' ? 'delta-up mono' : 'muted'}>{k.sub}</span>
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
                <span className="marker"></span>Portfolio projection · 60d
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
              <ProjectionChart width={680} height={240} glow={glow} />
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">
                <span className="marker green"></span>AI predictions
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
                        fontFamily: 'var(--font-geist-mono), "Geist Mono", monospace',
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

function StepPreview({ kind, glow = 1 }: { kind: 'connect' | 'project' | 'act'; glow?: number }) {
  if (kind === 'connect') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: 16 }}>
        {['Coinbase', 'Binance', 'Ledger', 'MetaMask'].map((w, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: 11,
              color: 'var(--text-2)',
              padding: '4px 0',
            }}
          >
            <span>{w}</span>
            <span style={{ color: i < 2 ? 'var(--green)' : 'var(--text-3)' }}>
              {i < 2 ? '● connected' : '○ link'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'project') {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <ProjectionChart width={300} height={110} glow={glow} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: 16 }}>
      {[
        { t: 'BULLISH', c: 'var(--green-2)', bg: 'var(--green-soft)', l: 'BTC accumulation' },
        { t: 'NEUTRAL', c: 'var(--text-2)', bg: 'var(--surface-3)', l: 'ETH at resistance' },
        {
          t: 'BEARISH',
          c: 'oklch(0.78 0.18 25)',
          bg: 'oklch(0.45 0.18 25 / 0.18)',
          l: 'SOL funding cool',
        },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontFamily: 'var(--font-geist-mono), monospace',
          }}
        >
          <span
            style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 999,
              background: s.bg,
              color: s.c,
              letterSpacing: '0.16em',
            }}
          >
            {s.t}
          </span>
          <span style={{ color: 'var(--text-2)' }}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
      <div className="faq-q">
        <span>{q}</span>
        <span className="faq-icon">+</span>
      </div>
      <div className="faq-body">
        <div>
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [logo, setLogo] = useState<LogoVariant>('ears');
  const [glow] = useState(1);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', String(glow));
  }, [glow]);

  const features = [
    {
      num: '01',
      title: 'Portfolio projection',
      body: '60-day forecasts with bull, base and bear bands, computed from your live holdings — refreshed every 4 hours.',
      green: false,
      wide: false,
    },
    {
      num: '02',
      title: 'AI predictions',
      body: 'Ensemble of 5 models (Tabnet, LSTM, XGB, BERT, TFT) producing per-asset price targets with calibrated confidence.',
      green: true,
      wide: false,
    },
    {
      num: '03',
      title: 'Scenario simulator',
      body: 'Drag sliders for horizon, volatility and drift to see how your wealth re-prices in real time.',
      green: false,
      wide: false,
    },
    {
      num: '04',
      title: 'Live signals',
      body: 'Bullish / bearish / neutral signals fused from on-chain flows, macro data and social sentiment — auto-tagged with confidence scores so you can filter the noise.',
      green: false,
      wide: true,
    },
    {
      num: '05',
      title: 'Holdings analytics',
      body: 'Cost basis, P&L per lot, allocation drift and tax-lot tracking. The summary you wish your exchange gave you.',
      green: false,
      wide: false,
    },
  ];

  const steps: Array<{
    num: string;
    title: string;
    body: string;
    kind: 'connect' | 'project' | 'act';
  }> = [
    {
      num: '01 ↗',
      title: 'Connect',
      body: 'Link exchanges via read-only API or paste wallet addresses. Keys never leave the secure enclave.',
      kind: 'connect',
    },
    {
      num: '02 ↗',
      title: 'Project',
      body: 'Our ensemble re-fits hourly on 18 months of features — your forecasts update silently in the background.',
      kind: 'project',
    },
    {
      num: '03 ↗',
      title: 'Act',
      body: 'Set rebalance thresholds and signal alerts. Catoshi pings you when a scenario crosses your line.',
      kind: 'act',
    },
  ];

  const stats = [
    { lbl: 'Models in ensemble', val: '5', sub: '+1 paused, calibrating' },
    { lbl: 'Predictions / day', val: '1,248', sub: 'avg latency 84ms' },
    { lbl: 'Hit rate · 90d', val: '74.0%', sub: '+3.1pt vs prior cycle' },
    { lbl: 'AUM under projection', val: '$2.4B', sub: 'across 14k portfolios' },
  ];

  const plans = [
    {
      name: 'Hobby',
      price: '$0',
      period: '/ forever',
      featured: false,
      desc: 'For tracking a single wallet and exploring the projections.',
      items: [
        { text: '1 wallet, 5 assets', on: true },
        { text: 'Daily projections (24h refresh)', on: true },
        { text: 'Base case forecasts', on: true },
        { text: 'Bull / bear scenarios', on: false },
        { text: 'Live signals', on: false },
      ],
      cta: 'Start free',
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/ month',
      featured: true,
      desc: 'For active investors who plan, hedge and rebalance with intent.',
      items: [
        { text: 'Unlimited wallets & assets', on: true },
        { text: '4-hour ensemble refresh', on: true },
        { text: 'Bull / base / bear scenarios', on: true },
        { text: 'Live signals + email alerts', on: true },
        { text: 'Tax-lot tracking & CSV export', on: true },
      ],
      cta: 'Start 14-day trial',
    },
    {
      name: 'Desk',
      price: '$199',
      period: '/ month',
      featured: false,
      desc: 'For funds and prop desks running multi-portfolio mandates.',
      items: [
        { text: 'Everything in Pro', on: true },
        { text: 'Unlimited team seats', on: true },
        { text: 'Custom model weights', on: true },
        { text: 'API + webhook access', on: true },
        { text: 'Dedicated success engineer', on: true },
      ],
      cta: 'Talk to sales',
    },
  ];

  const faqs = [
    {
      q: 'How are projections actually generated?',
      a: 'Five models — Tabnet-Pro, OnChain-LSTM, Macro-XGB, Sentiment-BERT and TFT-Ensemble — each produce a forward distribution. The ensemble averages them weighted by 90-day calibration. The 5th / 50th / 95th percentile slices become bear / base / bull.',
    },
    {
      q: 'Do you trade for me?',
      a: 'No. Catoshi is a projection and analytics layer. You execute trades on your own exchange or wallet — we just make the call clearer.',
    },
    {
      q: 'What about my keys?',
      a: 'We only request read-only API keys, validated at link time. Wallet addresses are watch-only. Nothing custodial, nothing signing.',
    },
    {
      q: 'Where does the data come from?',
      a: 'Glassnode & Dune for on-chain, FRED & Bloomberg for macro, LunarCrush for social, and direct exchange APIs for prices. ~340 features per asset, refreshed hourly.',
    },
    {
      q: 'Can I trust a 74% accuracy claim?',
      a: 'The Models page shows live calibration: predicted vs realized, Brier score, and per-model hit rates over 30 / 90 / 365 days. We publish the numbers — including when they slip.',
    },
  ];

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="land-nav">
        <div className="brand-flex">
          <Cat variant={logo} size={26} glow={glow} />
          <CatoshiWordmark size={16} />
        </div>
        <div className="land-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="land-nav-cta">
          <Link
            href={APP_HREF}
            className="btn-cta-ghost"
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Sign in
          </Link>
          <Link href={APP_HREF} className="btn-cta" style={{ padding: '10px 16px', fontSize: 13 }}>
            Open app →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="eyebrow">
          <span className="dot"></span>
          v3.2 ensemble · 74% accuracy this cycle
        </div>
        <h1>
          Crypto projections,
          <br />
          with the math that <span className="neon-violet">matters</span>{' '}
          <span className="neon-green">most.</span>
        </h1>
        <p className="lede">
          Catoshi runs an ensemble of 5 ML models on on-chain, macro, and sentiment data — turning
          your portfolio into bull / base / bear scenarios you can actually plan around.
        </p>
        <div className="hero-cta">
          <Link href={APP_HREF} className="btn-cta">
            Start free →
          </Link>
          <a href="#how" className="btn-cta-ghost">
            See how it works
          </a>
        </div>
        <div className="hero-meta">
          <span>
            <span className="ok">●</span> No credit card
          </span>
          <span>
            <span className="ok">●</span> Read-only wallet access
          </span>
          <span>
            <span className="ok">●</span> SOC 2 Type II
          </span>
        </div>
        <Showcase glow={glow} />
      </section>

      {/* Logo strip */}
      <div className="logos-strip">
        <div className="lbl">Trusted by data-driven crypto teams</div>
        <div className="logos-row">
          <span>◆ Hyperion Capital</span>
          <span>◇ Foundry Labs</span>
          <span>▲ Northstar DAO</span>
          <span>● Mosaic Research</span>
          <span>◈ Bitwise Pro</span>
          <span>◐ Lattice Trading</span>
        </div>
      </div>

      {/* Features */}
      <section className="section" id="features">
        <div className="section-head">
          <div className="kicker">PRODUCT</div>
          <h2>Every projection, modeled six ways.</h2>
          <p>
            From scenario sliders to whale-flow signals, Catoshi makes the assumptions behind every
            number visible — so you can disagree with the model, not the math.
          </p>
        </div>
        <div className="features">
          {features.map((f, i) => (
            <div key={i} className={`feature${f.green ? 'green' : ''}${f.wide ? 'wide' : ''}`}>
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
          <h2>Three steps from wallet to forecast.</h2>
          <p>No spreadsheets. No SQL. Connect once and we keep your projections fresh forever.</p>
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

      {/* Stats */}
      <section className="section">
        <div className="stats">
          {stats.map((s, i) => (
            <div key={i} className="cell">
              <div className="lbl">{s.lbl}</div>
              <div className="val tnum">{s.val}</div>
              <div className="sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="section-head">
          <div className="kicker">PRICING</div>
          <h2>Start free. Upgrade when the alpha pays for itself.</h2>
          <p>One flat rate, no per-trade fees, no surprises. Cancel any time.</p>
        </div>
        <div className="pricing">
          {plans.map((plan, i) => (
            <div key={i} className={`plan${plan.featured ? 'featured' : ''}`}>
              <div className="name">{plan.name}</div>
              <div className="price">
                {plan.price} <small>{plan.period}</small>
              </div>
              <p className="desc">{plan.desc}</p>
              <ul>
                {plan.items.map((item, j) => (
                  <li key={j} className={item.on ? '' : 'muted'}>
                    {item.text}
                  </li>
                ))}
              </ul>
              <button className="btn-plan">{plan.cta}</button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="section-head">
          <div className="kicker">FAQ</div>
          <h2>Questions, with the small print.</h2>
        </div>
        <div className="faq">
          {faqs.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="section">
        <div className="final-cta">
          <h2>Stop guessing. Start projecting.</h2>
          <p>
            Connect your first wallet in 60 seconds. Your future self will thank you (with numbers).
          </p>
          <div className="hero-cta">
            <Link href={APP_HREF} className="btn-cta">
              Open the app →
            </Link>
            <a href="#pricing" className="btn-cta-ghost">
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div style={{ flex: '0 0 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Cat variant={logo} size={26} glow={glow} />
            <CatoshiWordmark size={16} />
          </div>
          <p className="small muted" style={{ lineHeight: 1.6, margin: 0 }}>
            Crypto projections that show their work. Made for the data-curious.
          </p>
          {/* Logo variant picker */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            {(['tail', 'ears', 'mono'] as LogoVariant[]).map((v) => (
              <div
                key={v}
                onClick={() => setLogo(v)}
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  background: logo === v ? 'var(--violet-soft)' : 'transparent',
                  border: `1px solid ${logo === v ? 'oklch(0.55 0.20 295 / 0.30)' : 'var(--line)'}`,
                }}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
        {[
          {
            title: 'Product',
            links: [
              { t: 'Features', h: '#features' },
              { t: 'Pricing', h: '#pricing' },
              { t: 'App', h: APP_HREF },
              { t: 'Changelog', h: '#' },
            ],
          },
          {
            title: 'Company',
            links: [
              { t: 'About', h: '#' },
              { t: 'Careers', h: '#' },
              { t: 'Blog', h: '#' },
              { t: 'Press', h: '#' },
            ],
          },
          {
            title: 'Resources',
            links: [
              { t: 'Docs', h: '#' },
              { t: 'API', h: '#' },
              { t: 'Models', h: '#' },
              { t: 'Status', h: '#' },
            ],
          },
          {
            title: 'Legal',
            links: [
              { t: 'Privacy', h: '#' },
              { t: 'Terms', h: '#' },
              { t: 'Security', h: '#' },
              { t: 'Disclaimer', h: '#' },
            ],
          },
        ].map((col, i) => (
          <div key={i} className="col">
            <h5>{col.title}</h5>
            {col.links.map((l, j) => (
              <a key={j} href={l.h}>
                {l.t}
              </a>
            ))}
          </div>
        ))}
        <div className="copy">
          © 2026 Catoshi Labs · Crypto involves risk. Projections are statistical, not guaranteed.
          Not investment advice.
        </div>
      </footer>
    </div>
  );
}
