'use client';

import { Sparkline, ProjectionChart } from './charts';

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>{children}</div>;
}

// ─── PORTFOLIO ────────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const positions = [
    { sym: 'BTC',  name: 'Bitcoin',   qty: 1.4823, avg: 46210, mark: 69750.40, alloc: 42, target: 40 },
    { sym: 'ETH',  name: 'Ethereum',  qty: 16.802, avg: 3120,  mark: 4140.18,  alloc: 28, target: 30 },
    { sym: 'SOL',  name: 'Solana',    qty: 134.18, avg: 142,   mark: 259.04,   alloc: 14, target: 12 },
    { sym: 'TAO',  name: 'Bittensor', qty: 49.04,  avg: 318,   mark: 456.20,   alloc: 9,  target: 8  },
    { sym: 'LINK', name: 'Chainlink', qty: 770,    avg: 18.40, mark: 22.41,    alloc: 7,  target: 5  },
  ];
  const txns = [
    { d: 'May 06 14:02', t: 'Buy',    sym: 'TAO', qty: '+12.0',  px: '$448.10',   val: '$5,377.20'  },
    { d: 'May 04 09:48', t: 'Sell',   sym: 'ARB', qty: '−1,820', px: '$1.07',     val: '$1,947.40'  },
    { d: 'May 02 22:14', t: 'Buy',    sym: 'ETH', qty: '+2.40',  px: '$4,022.00', val: '$9,652.80'  },
    { d: 'Apr 29 11:11', t: 'Stake',  sym: 'SOL', qty: '+50.0',  px: '—',         val: '—'          },
    { d: 'Apr 27 16:33', t: 'Buy',    sym: 'BTC', qty: '+0.18',  px: '$67,420',   val: '$12,135.60' },
    { d: 'Apr 24 08:02', t: 'Reward', sym: 'ETH', qty: '+0.041', px: '—',         val: '$169.40'    },
  ];

  const txColor = (type: string) => ({
    bg: type === 'Buy' ? 'var(--green-soft)' : type === 'Sell' ? 'oklch(0.45 0.18 25 / 0.18)' : type === 'Stake' ? 'var(--violet-soft)' : 'var(--surface-3)',
    fg: type === 'Buy' ? 'var(--green-2)' : type === 'Sell' ? 'oklch(0.78 0.18 25)' : type === 'Stake' ? 'oklch(0.78 0.22 295)' : 'var(--text-2)',
  });

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div className="card padless">
        <div className="kpis">
          {[
            { lbl: 'Cost basis',   val: '$192,840', deltaText: 'over 14 lots', deltaClass: 'muted' },
            { lbl: 'Market value', val: '$248,392', deltaText: '+ $55,552',    deltaClass: 'delta-up mono' },
            { lbl: 'Unrealized',   val: '+$55,552', deltaText: '+ 28.81%',     deltaClass: 'delta-up mono' },
            { lbl: 'Realized YTD', val: '+$8,140',  deltaText: 'tax lots: 6',  deltaClass: 'muted' },
          ].map((k, i) => (
            <div className="kpi" key={i}>
              <div className="lbl">{k.lbl}</div>
              <div className="val tnum">{k.val}</div>
              <div className="sub"><span className={k.deltaClass}>{k.deltaText}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Positions + Allocation drift */}
      <div className="pg-split" style={{ gap: 14 }}>
        <div className="card glow-violet">
          <div className="card-header">
            <div className="card-title"><span className="marker"></span>Positions</div>
            <Row>
              <button className="btn-ghost">Filter</button>
              <button className="btn-primary">+ Add lot</button>
            </Row>
          </div>
          <div className="tbl-wrap"><table className="watch-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Avg cost</th>
                <th style={{ textAlign: 'right' }}>Mark</th>
                <th style={{ textAlign: 'right' }}>P&amp;L</th>
                <th>Alloc · target</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const cost = p.qty * p.avg;
                const mkt = p.qty * p.mark;
                const pnl = mkt - cost;
                const pnlPct = (pnl / cost) * 100;
                const drift = p.alloc - p.target;
                return (
                  <tr key={i}>
                    <td>
                      <div className="sym">
                        <div className={`coin-mark ${p.sym.toLowerCase()}`}>{p.sym.slice(0, 1)}</div>
                        <div><div>{p.sym}</div><div className="name">{p.name}</div></div>
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{p.qty.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>${p.avg.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>${p.mark.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      <div className={pnl >= 0 ? 'delta-up' : 'delta-dn'}>
                        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                      <div className="small mono" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.7 }}>
                        {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                      </div>
                    </td>
                    <td>
                      <Row style={{ gap: 8 }}>
                        <div className="proj-bar" style={{ width: 90 }}>
                          <div className="center" style={{ left: `${p.target}%` }}></div>
                          <div className={`fill ${drift >= 0 ? '' : 'green'}`} style={{ left: 0, width: `${p.alloc}%` }}></div>
                        </div>
                        <span className="mono small">{p.alloc}% / {p.target}%</span>
                      </Row>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><span className="marker green"></span>Allocation drift</div>
          </div>
          <p className="small muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            Drift from target weights, in absolute points. Rebalance suggested when |drift| &gt; 3pt.
          </p>
          {positions.map((p, i) => {
            const d = p.alloc - p.target;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                <span className="mono small" style={{ color: 'var(--text-2)' }}>{p.sym}</span>
                <div style={{ position: 'relative', height: 6, background: 'var(--surface-3)', borderRadius: 999 }}>
                  <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: 'var(--line-2)' }}></div>
                  <div style={{
                    position: 'absolute', height: '100%', borderRadius: 999,
                    background: d >= 0 ? 'var(--violet)' : 'var(--green)',
                    boxShadow: `0 0 calc(8px * var(--glow)) ${d >= 0 ? 'var(--violet)' : 'var(--green)'}`,
                    left: d >= 0 ? '50%' : `${50 + d * 4}%`,
                    width: `${Math.abs(d) * 4}%`,
                  }}></div>
                </div>
                <span className="mono small" style={{ textAlign: 'right', color: d >= 0 ? 'var(--violet)' : 'var(--green)' }}>
                  {d >= 0 ? '+' : ''}{d}pt
                </span>
              </div>
            );
          })}
          <div className="divider"></div>
          <button className="btn-primary" style={{ width: '100%' }}>Rebalance to target</button>
        </div>
      </div>

      {/* Transactions */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><span className="marker"></span>Recent transactions</div>
          <button className="btn-ghost">Export CSV</button>
        </div>
        <div className="tbl-wrap"><table className="watch-table">
          <thead>
            <tr>
              <th>When</th><th>Type</th><th>Asset</th>
              <th style={{ textAlign: 'right' }}>Quantity</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((tx, i) => {
              const { bg, fg } = txColor(tx.t);
              return (
                <tr key={i}>
                  <td className="mono small" style={{ color: 'var(--text-2)' }}>{tx.d}</td>
                  <td>
                    <span style={{ fontSize: 10, letterSpacing: '0.16em', padding: '3px 8px', borderRadius: 999, background: bg, color: fg }}>
                      {tx.t.toUpperCase()}
                    </span>
                  </td>
                  <td className="mono">{tx.sym}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{tx.qty}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{tx.px}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{tx.val}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ─── MARKETS ──────────────────────────────────────────────────────────────────

export function MarketsPage() {
  const sectors = [
    { name: 'Layer 1',      count: 18, change: '+2.4%', up: true  },
    { name: 'AI / Compute', count: 11, change: '+8.6%', up: true  },
    { name: 'DeFi',         count: 22, change: '−1.1%', up: false },
    { name: 'L2 / Scaling', count: 9,  change: '+3.2%', up: true  },
    { name: 'RWA',          count: 7,  change: '+0.4%', up: true  },
    { name: 'Memes',        count: 14, change: '−4.8%', up: false },
  ];
  const assets = [
    { sym: 'BTC', name: 'Bitcoin',   px: '$69,750.40', d24: '+1.84%', up: true,  vol: '$28.4B', mc: '$1.37T', proj: '+12.4%', conf: 81, spark: 3  },
    { sym: 'ETH', name: 'Ethereum',  px: '$4,140.18',  d24: '+2.62%', up: true,  vol: '$14.1B', mc: '$497B',  proj: '+18.1%', conf: 74, spark: 7  },
    { sym: 'SOL', name: 'Solana',    px: '$259.04',    d24: '−0.78%', up: false, vol: '$3.2B',  mc: '$118B',  proj: '+9.6%',  conf: 68, spark: 11 },
    { sym: 'TAO', name: 'Bittensor', px: '$456.20',    d24: '+5.20%', up: true,  vol: '$220M',  mc: '$3.4B',  proj: '+34.2%', conf: 52, spark: 21 },
    { sym: 'LINK',name: 'Chainlink', px: '$22.41',     d24: '+0.41%', up: true,  vol: '$540M',  mc: '$13.6B', proj: '+6.2%',  conf: 71, spark: 13 },
    { sym: 'ARB', name: 'Arbitrum',  px: '$1.04',      d24: '−2.12%', up: false, vol: '$310M',  mc: '$3.1B',  proj: '−4.1%',  conf: 58, spark: 17 },
    { sym: 'ETH', name: 'Render',    px: '$10.84',     d24: '+11.4%', up: true,  vol: '$190M',  mc: '$5.4B',  proj: '+22.8%', conf: 64, spark: 25 },
    { sym: 'ETH', name: 'Lido',      px: '$2.34',      d24: '−1.40%', up: false, vol: '$80M',   mc: '$2.1B',  proj: '+5.2%',  conf: 55, spark: 29 },
  ];

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div className="card padless">
        <div className="kpis">
          {[
            { lbl: 'Total market cap', val: '$2.61T',     sub: '+ 1.8%',     cls: 'delta-up mono' },
            { lbl: 'BTC dominance',    val: '52.4%',      sub: '−0.4pt 24h', cls: 'muted' },
            { lbl: '24h volume',       val: '$94.2B',     sub: '+ 12%',      cls: 'delta-up mono' },
            { lbl: 'Fear & greed',     val: '68 · Greed', sub: '+3 from yest.', cls: 'muted' },
          ].map((k, i) => (
            <div className="kpi" key={i}>
              <div className="lbl">{k.lbl}</div>
              <div className="val tnum">{k.val}</div>
              <div className="sub"><span className={k.cls}>{k.sub}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Sectors */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><span className="marker"></span>Sectors · 24h</div>
          <button className="btn-ghost">All sectors →</button>
        </div>
        <div className="pg-sectors" style={{ gap: 10 }}>
          {sectors.map((s, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--bg-2)' }}>
              <div className="small muted" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10 }}>{s.name}</div>
              <div className={`tnum ${s.up ? 'delta-up' : 'delta-dn'}`} style={{ fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>{s.change}</div>
              <div className="small mono" style={{ color: 'var(--text-3)', marginTop: 4 }}>{s.count} assets</div>
            </div>
          ))}
        </div>
      </div>

      {/* Markets table */}
      <div className="card glow-violet">
        <div className="card-header">
          <div className="card-title"><span className="marker green"></span>All markets</div>
          <Row>
            <div className="search" style={{ maxWidth: 220, height: 32 }}>
              <span style={{ opacity: 0.5 }}>⌕</span>
              <input placeholder="Filter assets…" />
            </div>
            <button className="btn-ghost">Sort: Cap ↓</button>
          </Row>
        </div>
        <div className="tbl-wrap"><table className="watch-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>24h</th>
              <th style={{ textAlign: 'right' }}>Volume</th>
              <th style={{ textAlign: 'right' }}>Market cap</th>
              <th>Trend</th>
              <th style={{ textAlign: 'right' }}>60d projection</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={i}>
                <td>
                  <div className="sym">
                    <div className={`coin-mark ${a.sym.toLowerCase()}`}>{a.sym.slice(0, 1)}</div>
                    <div><div>{a.sym}</div><div className="name">{a.name}</div></div>
                  </div>
                </td>
                <td className="tnum" style={{ textAlign: 'right' }}>{a.px}</td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  <span className={a.up ? 'delta-up' : 'delta-dn'}>{a.d24}</span>
                </td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{a.vol}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{a.mc}</td>
                <td><Sparkline width={90} height={24} seed={a.spark} color={a.up ? 'green' : 'red'} /></td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  <span className={a.proj.startsWith('+') ? 'delta-up' : 'delta-dn'}>{a.proj}</span>
                </td>
                <td>
                  <Row style={{ gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${a.conf}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--violet), var(--green))', boxShadow: '0 0 calc(8px * var(--glow)) var(--violet)' }}></div>
                    </div>
                    <span className="mono small" style={{ width: 28, textAlign: 'right' }}>{a.conf}</span>
                  </Row>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ─── SIGNALS ──────────────────────────────────────────────────────────────────

export function SignalsPage() {
  const items = [
    { side: 'bullish', tag: 'BULLISH', src: 'On-chain · BTC',   title: 'Whale accumulation up 14% w/w; supply on exchanges hits 5y low.',         body: 'Cohort of addresses with >1k BTC added 38,420 BTC in the last 7 days. Exchange supply fell to 2.31M coins, lowest since Mar 2021.',           meta: '4 sources · 2h ago',    conf: 84 },
    { side: 'bullish', tag: 'BULLISH', src: 'Macro',            title: 'Real yields trending down. Risk-on assets gaining bid.',                   body: '10Y TIPS yield down 18bps in 2 weeks. DXY rolling over off 106. Crypto correlates ~0.7 with risk-on regimes.',                                  meta: 'Reuters · 5h ago',      conf: 71 },
    { side: 'bearish', tag: 'BEARISH', src: 'Sentiment · SOL',  title: 'Funding rates compressing after 9d positive streak.',                      body: 'Perp funding cooled from +18bps to +4bps over last 24h. Open interest holding flat — likely de-risking, not flush.',                            meta: 'Coinglass · 1h ago',    conf: 62 },
    { side: 'neutral', tag: 'NEUTRAL', src: 'Technicals · ETH', title: 'Pinned at $4.1K resistance; 50/200 EMA cross pending.',                   body: 'Three rejections at $4,140 in 9 days. 50-EMA closing on 200-EMA from below — golden cross expected within 5 sessions.',                       meta: 'Auto · 30m ago',        conf: 55 },
    { side: 'bullish', tag: 'BULLISH', src: 'On-chain · TAO',   title: 'Validator stake +22% MoM as Subnet 4 launches.',                          body: 'New compute subnet drove a 22% increase in delegated stake. Active validators up to 4,180 from 3,420.',                                          meta: 'Taostats · 4h ago',     conf: 69 },
    { side: 'bearish', tag: 'BEARISH', src: 'Flow · ARB',       title: 'Net outflow $42M from L2 sequencer over 48h.',                            body: 'Bridge outflows exceed inflows for 4 consecutive days. Sequencer revenue down 28% from prior week.',                                              meta: 'Dune · 6h ago',         conf: 58 },
    { side: 'bullish', tag: 'BULLISH', src: 'Sentiment · ETH',  title: 'Twitter mentions of "ETH" up 3.2σ above 30d mean.',                       body: 'Spike correlates with growing options call volume at $4,500 strike. Skew flipped positive overnight.',                                              meta: 'LunarCrush · 7h ago',   conf: 48 },
    { side: 'neutral', tag: 'NEUTRAL', src: 'Macro',            title: 'Fed minutes mid-week; rates path remains the dominant driver.',            body: 'Curve pricing 60% chance of cut by Sep. Wording shifts likely to move risk assets ±2-4%.',                                                        meta: 'Bloomberg · 1d ago',    conf: 50 },
  ];

  const filters = ['All', 'Bullish', 'Bearish', 'Neutral', 'On-chain', 'Macro', 'Sentiment', 'Technicals'];

  return (
    <div style={{ marginTop: 16 }}>
      <Row style={{ gap: 8, padding: '0 4px 12px', flexWrap: 'wrap' }}>
        {filters.map((f, i) => (
          <button
            key={f}
            className="btn-ghost"
            style={i === 0 ? { background: 'var(--violet-soft)', color: 'var(--text)', borderColor: 'oklch(0.55 0.20 295 / 0.5)' } : {}}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }} className="small muted">{items.length} signals · last 24h</span>
      </Row>

      <div className="pg-signals-2" style={{ gap: 14 }}>
        {items.map((s, i) => (
          <div className={`signal ${s.side}`} key={i} style={{ padding: 18 }}>
            <div className="head">
              <span className="tag">{s.tag}</span>
              <span className="src">{s.src}</span>
            </div>
            <h4 style={{ fontSize: 15 }}>{s.title}</h4>
            <p className="small muted" style={{ margin: '4px 0 8px', lineHeight: 1.6 }}>{s.body}</p>
            <div className="foot">
              <span>{s.meta}</span>
              <Row style={{ gap: 6 }}>
                <span>conf {s.conf}%</span>
                <div style={{ width: 50, height: 4, background: 'var(--surface-3)', borderRadius: 999 }}>
                  <div style={{ height: '100%', width: `${s.conf}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--violet), var(--green))' }}></div>
                </div>
              </Row>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MODELS ───────────────────────────────────────────────────────────────────

export function ModelsPage({ glow }: { glow: number }) {
  const models = [
    { name: 'Tabnet-Pro',     kind: 'Tabular DNN',     acc: 71.2, hits: '184/258', weight: 26, status: 'ACTIVE' },
    { name: 'OnChain-LSTM',   kind: 'Sequence',        acc: 68.4, hits: '211/308', weight: 22, status: 'ACTIVE' },
    { name: 'Macro-XGB',      kind: 'Gradient boost',  acc: 66.0, hits: '131/198', weight: 18, status: 'ACTIVE' },
    { name: 'Sentiment-BERT', kind: 'NLP',             acc: 62.8, hits: '94/150',  weight: 14, status: 'ACTIVE' },
    { name: 'TFT-Ensemble',   kind: 'Temporal Fusion', acc: 73.1, hits: '52/71',   weight: 20, status: 'ACTIVE' },
    { name: 'Whale-Graph',    kind: 'Graph NN',        acc: 58.4, hits: '38/65',   weight: 0,  status: 'PAUSED' },
  ];

  const predictions = [
    { sym: 'BTC',  dir: 'long',  hz: '60D', target: '$78,420', model: 'Tabnet-Pro',     conf: 81 },
    { sym: 'ETH',  dir: 'long',  hz: '60D', target: '$4,890',  model: 'TFT-Ensemble',   conf: 74 },
    { sym: 'SOL',  dir: 'long',  hz: '60D', target: '$284',    model: 'OnChain-LSTM',   conf: 68 },
    { sym: 'TAO',  dir: 'long',  hz: '60D', target: '$612',    model: 'Sentiment-BERT', conf: 52 },
    { sym: 'ARB',  dir: 'short', hz: '30D', target: '$0.92',   model: 'Whale-Graph',    conf: 58 },
    { sym: 'LINK', dir: 'long',  hz: '60D', target: '$23.80',  model: 'Macro-XGB',      conf: 71 },
  ];

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div className="card padless">
        <div className="kpis">
          {[
            { lbl: 'Ensemble accuracy', val: '74.0%',     sub: '+ 3.1pt',        cls: 'delta-up mono' },
            { lbl: 'Active models',     val: '5 / 6',     sub: '1 paused',       cls: 'muted' },
            { lbl: 'Last training',     val: '14:02 UTC', sub: 'cycle 412',      cls: 'muted' },
            { lbl: 'Predictions / day', val: '1,248',     sub: 'avg latency 84ms', cls: 'muted' },
          ].map((k, i) => (
            <div className="kpi" key={i}>
              <div className="lbl">{k.lbl}</div>
              <div className="val tnum">{k.val}</div>
              <div className="sub"><span className={k.cls}>{k.sub}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Models table + calibration chart */}
      <div className="pg-split" style={{ gap: 14 }}>
        <div className="card glow-violet">
          <div className="card-header">
            <div className="card-title"><span className="marker"></span>Models · ensemble</div>
            <button className="btn-primary">Retrain all</button>
          </div>
          <div className="tbl-wrap"><table className="watch-table">
            <thead>
              <tr>
                <th>Model</th><th>Type</th>
                <th style={{ textAlign: 'right' }}>Accuracy</th>
                <th style={{ textAlign: 'right' }}>Hits</th>
                <th>Weight</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={i}>
                  <td><div className="mono">{m.name}</div></td>
                  <td><span className="small muted">{m.kind}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    <span className={m.acc >= 65 ? 'delta-up' : ''}>{m.acc.toFixed(1)}%</span>
                  </td>
                  <td className="mono small" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{m.hits}</td>
                  <td>
                    <Row style={{ gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 999, maxWidth: 110 }}>
                        <div style={{
                          height: '100%', width: `${m.weight * 3}%`, borderRadius: 999,
                          background: m.weight ? 'var(--violet)' : 'var(--surface-3)',
                          boxShadow: m.weight ? '0 0 calc(8px * var(--glow)) var(--violet)' : 'none',
                        }}></div>
                      </div>
                      <span className="mono small" style={{ width: 28 }}>{m.weight}%</span>
                    </Row>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 9, letterSpacing: '0.18em', padding: '3px 8px', borderRadius: 999,
                      background: m.status === 'ACTIVE' ? 'var(--green-soft)' : 'var(--surface-3)',
                      color: m.status === 'ACTIVE' ? 'var(--green-2)' : 'var(--text-3)',
                    }}>{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><span className="marker green"></span>Calibration · last 30d</div>
          </div>
          <div style={{ position: 'relative', height: 200 }}>
            <ProjectionChart width={320} height={200} glow={glow} />
          </div>
          <div className="divider"></div>
          <p className="small muted" style={{ lineHeight: 1.6, margin: 0 }}>
            Ensemble's predicted vs realized returns. Brier score{' '}
            <strong style={{ color: 'var(--text)' }}>0.184</strong>, well within target band.
          </p>
        </div>
      </div>

      {/* Recent predictions */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><span className="marker"></span>Recent predictions</div>
          <button className="btn-ghost">View all →</button>
        </div>
        <div className="pg-thirds" style={{ gap: 10 }}>
          {predictions.map((p, i) => (
            <div key={i} className="ai-pred">
              <div className="pair">
                <Row>
                  <div className={`coin-mark ${p.sym.toLowerCase()}`}>{p.sym.slice(0, 1)}</div>
                  <div>
                    <div className="sym">
                      {p.sym} · <span className="small muted" style={{ letterSpacing: '0.04em' }}>{p.dir.toUpperCase()}</span>
                    </div>
                    <div className="muted small">{p.model} · {p.hz}</div>
                  </div>
                </Row>
                <div style={{ textAlign: 'right' }}>
                  <div className="target tnum glow-text-violet">{p.target}</div>
                  <div className="mono small" style={{ color: 'var(--text-3)' }}>conf {p.conf}%</div>
                </div>
              </div>
              <div className="gauge" aria-hidden="true">
                <div className="fill" style={{ width: `${p.conf}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
