'use client';

import { portfolioKpis, positions, transactions } from '@/data/portfolio';
import type { Transaction } from '@/data/types';

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>{children}</div>;
}

function txColor(type: Transaction['t']) {
  return {
    bg: type === 'Buy'    ? 'var(--green-soft)'              : type === 'Sell'   ? 'oklch(0.45 0.18 25 / 0.18)' : type === 'Stake' ? 'var(--violet-soft)' : 'var(--surface-3)',
    fg: type === 'Buy'    ? 'var(--green-2)'                 : type === 'Sell'   ? 'oklch(0.78 0.18 25)'         : type === 'Stake' ? 'oklch(0.78 0.22 295)' : 'var(--text-2)',
  };
}

export function PortfolioPage() {
  return (
    <div className="page-content">
      {/* KPIs */}
      <div className="card padless">
        <div className="kpis">
          {portfolioKpis.map((k, i) => (
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
            {transactions.map((tx, i) => {
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
