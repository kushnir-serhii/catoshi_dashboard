'use client';

import { useState } from 'react';

import { ROLE_ADMIN, ROLE_USER } from '@/consts/auth';
import { type HealthPayload, useHealth, useNewsPause } from '@/hooks/useAdminSettings';
import { type AdminUser, useAdminUsers } from '@/hooks/useAdminUsers';

const CARD_BOX: React.CSSProperties = {
  padding: 'var(--sp-5)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface-2)',
  border: '1px solid var(--surface-3)',
};

const CELL: React.CSSProperties = {
  padding: 'var(--sp-3) var(--sp-3)',
  borderBottom: '1px solid var(--surface-3)',
  textAlign: 'left',
  verticalAlign: 'top',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function AllowanceControl({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An admin has no allowance to restore.
  if (user.role === ROLE_ADMIN) {
    return null;
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/allowance`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Restore failed (${res.status})`);
        return;
      }
      await onChanged();
    } catch {
      setError('Restore failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost small"
        disabled={pending}
        onClick={() => {
          void submit();
        }}
      >
        {pending ? 'Restoring…' : 'Restore allowance'}
      </button>
      {error && (
        <p className="small" style={{ margin: 'var(--sp-2) 0 0', color: 'var(--red)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function RoleControl({ user, onChanged }: { user: AdminUser; onChanged: () => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextRole = user.role === ROLE_ADMIN ? ROLE_USER : ROLE_ADMIN;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 self-demotion refusal (and any other refusal): surface inline,
        // leave the control unchanged.
        setError(body.error ?? `Change failed (${res.status})`);
        return;
      }
      await onChanged();
    } catch {
      setError('Change failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <span
        className="small"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-3)',
          background: 'var(--surface-3)',
          borderRadius: 'var(--radius-pill)',
          padding: 'var(--sp-0) var(--sp-2)',
        }}
      >
        {user.role}
      </span>
      <button
        type="button"
        className="btn btn-ghost small"
        disabled={pending}
        style={{ marginLeft: 'var(--sp-2)' }}
        onClick={() => {
          void submit();
        }}
      >
        {pending ? 'Saving…' : `Make ${nextRole}`}
      </button>
      {error && (
        <p className="small" style={{ margin: 'var(--sp-2) 0 0', color: 'var(--red)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function NewsPausePanel() {
  const { paused, isLoading, isError, mutate } = useNewsPause();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/news-pause', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Change failed (${res.status})`);
        return;
      }
      await mutate();
    } catch {
      setError('Change failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span className="marker"></span>News classification
        </div>
      </div>
      <div style={CARD_BOX}>
        {isLoading ? (
          <div
            className="animate-pulse"
            style={{ height: 14, width: 200, background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)' }}
          />
        ) : isError || paused === null ? (
          <p className="small" style={{ margin: 0, color: 'var(--red)' }}>
            The current state could not be read. Check back shortly.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span
              className="small"
              style={{
                fontFamily: 'var(--font-mono)',
                color: paused ? 'var(--red)' : 'var(--green)',
                background: 'var(--surface-3)',
                borderRadius: 'var(--radius-pill)',
                padding: 'var(--sp-0) var(--sp-3)',
              }}
            >
              {paused ? 'paused' : 'running'}
            </span>
            <span className="small muted">
              {paused
                ? 'No new headlines are being classified. Ingest and publishing of already-classified items continue.'
                : 'Unattended classification runs on the hourly collection pass.'}
            </span>
            <button
              type="button"
              className="btn btn-ghost small"
              disabled={pending}
              onClick={() => {
                void toggle(!paused);
              }}
            >
              {pending ? 'Saving…' : paused ? 'Resume classification' : 'Pause classification'}
            </button>
          </div>
        )}
        {error && (
          <p className="small" style={{ margin: 'var(--sp-2) 0 0', color: 'var(--red)' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ageLabel(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatTs(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function OperatorHealthPanel() {
  const { health, isLoading, isError } = useHealth();

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span className="marker"></span>Operator health
        </div>
      </div>
      {isLoading ? (
        <div className="animate-pulse" style={CARD_BOX}>
          <div
            style={{ height: 14, width: 240, background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)' }}
          />
        </div>
      ) : isError || !health ? (
        <div style={CARD_BOX}>
          <p className="small" style={{ margin: 0, color: 'var(--red)' }}>
            /api/health could not be read.
          </p>
        </div>
      ) : (
        <HealthDetail health={health} />
      )}
    </div>
  );
}

function HealthDetail({ health }: { health: HealthPayload }) {
  return (
    <div style={{ ...CARD_BOX, overflowX: 'auto', display: 'grid', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          className="small"
          style={{
            fontFamily: 'var(--font-mono)',
            color: health.ok ? 'var(--green)' : 'var(--red)',
            background: 'var(--surface-3)',
            borderRadius: 'var(--radius-pill)',
            padding: 'var(--sp-0) var(--sp-3)',
          }}
        >
          {health.ok ? 'ok' : 'stale'}
        </span>
        <span className="small muted">
          newest snapshot {ageLabel(health.newestSnapshotAgeMinutes)} old · threshold{' '}
          {health.staleThresholdMinutes}m · checked {formatTs(health.checkedAt)}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr>
            <th style={CELL} className="small muted">
              Asset
            </th>
            <th style={CELL} className="small muted">
              Newest snapshot
            </th>
            <th style={CELL} className="small muted">
              Age
            </th>
            <th style={CELL} className="small muted">
              Snapshots 24h
            </th>
            <th style={CELL} className="small muted">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {health.assets.map((asset) => (
            <tr key={asset.symbol}>
              <td style={CELL}>{asset.symbol}</td>
              <td style={CELL} className="small muted">
                {formatTs(asset.newestSnapshotTs)}
              </td>
              <td style={{ ...CELL, fontFeatureSettings: '"tnum"' }}>
                {ageLabel(asset.ageMinutes)}
              </td>
              <td style={{ ...CELL, fontFeatureSettings: '"tnum"' }}>{asset.snapshots24h}</td>
              <td style={CELL} className="small">
                <span style={{ color: asset.stale ? 'var(--red)' : 'var(--green)' }}>
                  {asset.stale ? 'stale' : 'fresh'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr>
            <th style={CELL} className="small muted">
              Collector
            </th>
            <th style={CELL} className="small muted">
              Last success
            </th>
            <th style={CELL} className="small muted">
              Last attempt
            </th>
            <th style={CELL} className="small muted">
              Last error
            </th>
          </tr>
        </thead>
        <tbody>
          {health.collectors.map((collector) => (
            <tr key={collector.source}>
              <td style={CELL}>{collector.source}</td>
              <td style={CELL} className="small muted">
                {formatTs(collector.lastSuccessAt)}
              </td>
              <td style={CELL} className="small muted">
                {formatTs(collector.lastAttemptAt)}
              </td>
              <td style={CELL} className="small">
                {collector.lastError ? (
                  <span style={{ color: 'var(--red)' }}>{collector.lastError}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
          {health.collectors.length === 0 && (
            <tr>
              <td style={CELL} colSpan={4} className="small muted">
                No collector status rows yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="small muted" style={{ margin: 0 }}>
        News classification: {health.newsClassificationPaused ? 'paused' : 'running'} · forecast
        ingest: {health.forecastIngest.state}
        {health.forecastIngest.lastAcceptedAt
          ? ` (last accepted ${ageLabel(health.forecastIngest.lastAcceptedAgeMinutes)} ago)`
          : ''}
        {health.forecastIngest.lastRejectionReason
          ? ` · last rejection: ${health.forecastIngest.lastRejectionReason}`
          : ''}
      </p>
    </div>
  );
}

export function AdminPage() {
  const { users, isLoading, isError, mutate } = useAdminUsers();

  return (
    <div className="page-content">
      <h1 className="sr-only">Administration</h1>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="marker"></span>Everyone who has signed in
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse" style={CARD_BOX}>
            <div
              style={{ height: 14, width: 220, background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
        ) : isError ? (
          <div style={CARD_BOX}>
            <p className="small" style={{ margin: 0, color: 'var(--red)' }}>
              The user list could not be read. This is not a measured result — check back shortly.
            </p>
          </div>
        ) : (
          <div style={{ ...CARD_BOX, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr>
                  <th style={CELL} className="small muted">
                    Name
                  </th>
                  <th style={CELL} className="small muted">
                    Email
                  </th>
                  <th style={CELL} className="small muted">
                    Role
                  </th>
                  <th style={CELL} className="small muted">
                    First signed in
                  </th>
                  <th style={CELL} className="small muted">
                    Forecasts today
                  </th>
                  <th style={CELL} className="small muted">
                    Allowance
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td style={CELL}>{user.name ?? '—'}</td>
                    <td style={CELL} className="small">
                      {user.email}
                    </td>
                    <td style={CELL}>
                      <RoleControl user={user} onChanged={() => mutate()} />
                    </td>
                    <td style={CELL} className="small muted">
                      {formatDate(user.createdAt)}
                    </td>
                    <td style={{ ...CELL, fontFeatureSettings: '"tnum"' }}>
                      {user.forecastsToday}
                    </td>
                    <td style={CELL}>
                      <AllowanceControl user={user} onChanged={() => mutate()} />
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td style={CELL} colSpan={6} className="small muted">
                      Nobody has signed in yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewsPausePanel />
      <OperatorHealthPanel />
    </div>
  );
}
