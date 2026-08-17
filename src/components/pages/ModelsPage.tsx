'use client';

import { useDashboard } from '@/components/dashboard/context';
import { ProjectionChart } from '@/components/dashboard/charts';
import { modelKpis, models, predictions } from '@/data/models';

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>{children}</div>;
}

export function ModelsPage() {
  const { glow: glowRaw } = useDashboard();
  const glow = glowRaw / 100;

  return (
    <div className="page-content">
      {/* KPIs */}
      <div className="card padless">
        <div className="kpis">
          {modelKpis.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="lbl">{k.lbl}</div>
              <div className="val tnum">{k.val}</div>
              <div className="sub"><span className={k.deltaClass}>{k.deltaText}</span></div>
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
          <div style={{ position: 'relative', height: 200, minWidth: 0, width: '100%' }}>
            <ProjectionChart glow={glow} />
          </div>
          <div className="divider"></div>
          <p className="small muted" style={{ lineHeight: 1.6, margin: 0 }}>
            Ensemble&apos;s predicted vs realized returns. Brier score{' '}
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
