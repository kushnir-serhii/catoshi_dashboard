'use client';

import { Surface } from '@heroui/react';
import { Sparkline } from '@/components/dashboard/charts';
import type { WatchlistRow } from '@/data/types';

interface WatchlistPanelProps {
  rows: WatchlistRow[];
}

export function WatchlistPanel({ rows }: WatchlistPanelProps) {
  return (
    <Surface className="card area-watch">
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
    </Surface>
  );
}
