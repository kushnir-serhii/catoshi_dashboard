'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardProvider, useDashboard } from './context';
import { Cat, CatoshiWordmark } from './CatLogo';
import { KPIs, ChartPanel, AIPanel, ScenarioPanel, WatchlistPanel, HoldingsPanel, SignalsPanel } from './panels';
import { PortfolioPage, MarketsPage, SignalsPage, ModelsPage } from './pages';
import { TweaksPanel } from './TweaksPanel';

const PAGES = [
  { key: 'projections', label: 'Projections' },
  { key: 'portfolio',   label: 'Portfolio' },
  { key: 'markets',     label: 'Markets' },
  { key: 'signals',     label: 'Signals', isNew: true },
  { key: 'models',      label: 'Models' },
] as const;

type PageKey = (typeof PAGES)[number]['key'];

function ProjectionsPage({ glow, layout }: { glow: number; layout: string }) {
  return (
    <div className={`grid layout-${layout}`}>
      <KPIs />
      <ChartPanel glow={glow} />
      <AIPanel glow={glow} />
      <ScenarioPanel />
      <WatchlistPanel />
      <HoldingsPanel glow={glow} />
      <SignalsPanel />
    </div>
  );
}


function DashboardInner() {
  const { logo, layout, glow, tweaksOpen, setTweaksOpen } = useDashboard();
  const [page, setPage] = useState<PageKey>('projections');
  const glowNorm = glow / 100;

  return (
    <>
      <div className="app">
        {/* Top bar */}
        <div className="topbar">
          <div className="brand" onClick={() => setPage('projections')}>
            <Cat variant={logo} size={28} glow={glowNorm} />
            <CatoshiWordmark size={16} />
          </div>
          <nav className="nav">
            {PAGES.map((p) => (
              <a
                key={p.key}
                href={`#${p.key}`}
                className={page === p.key ? 'active' : ''}
                onClick={(e) => { e.preventDefault(); setPage(p.key); }}
              >
                {p.label}
                {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
              </a>
            ))}
          </nav>
          <div className="search">
            <span style={{ fontSize: 16, opacity: 0.5 }}>⌕</span>
            <input placeholder="Search assets, models, signals…" />
            <kbd>⌘K</kbd>
          </div>
          <div className="balance">
            <div>
              <div className="lbl">BALANCE</div>
              <div className="val tnum">$248,392.41 <span className="delta">+5.26%</span></div>
            </div>
            <div className="avatar">CT</div>
          </div>
          <Link href="/landing" className="btn-ghost" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>← Home</Link>
          <button className="tweaks-btn" onClick={() => setTweaksOpen(!tweaksOpen)} title="Tweaks">
            ⚙
          </button>
        </div>

        {/* Mobile nav (hidden on desktop) */}
        <nav className="mobile-nav">
          {PAGES.map((p) => (
            <a
              key={p.key}
              href={`#${p.key}`}
              className={page === p.key ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); setPage(p.key); }}
            >
              {p.label}
              {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
            </a>
          ))}
        </nav>

        {/* Page content */}
        {page === 'projections' && <ProjectionsPage glow={glowNorm} layout={layout} />}
        {page === 'portfolio'   && <PortfolioPage />}
        {page === 'markets'     && <MarketsPage />}
        {page === 'signals'     && <SignalsPage />}
        {page === 'models'      && <ModelsPage glow={glowNorm} />}
      </div>

      <TweaksPanel />
    </>
  );
}

export function CryptoDashboard() {
  return (
    <DashboardProvider>
      <DashboardInner />
    </DashboardProvider>
  );
}
