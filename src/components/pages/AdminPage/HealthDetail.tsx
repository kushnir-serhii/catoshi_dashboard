import { Muted } from '@/components/ui';
import type { HealthPayload } from '@/hooks/useAdminSettings';
import { cn } from '@/utils/cn';

import { AdminBox } from './AdminBox';
import { AdminTable } from './AdminTable';
import { AdminTd } from './AdminTd';
import { StatusPill } from './StatusPill';
import { ageLabel, formatTs } from './utils';

const ASSET_COLUMNS = ['Asset', 'Newest snapshot', 'Age', 'Snapshots 24h', 'State'];
const COLLECTOR_COLUMNS = ['Collector', 'Last success', 'Last attempt', 'Last error'];

export function HealthDetail({ health }: { health: HealthPayload }) {
  return (
    <AdminBox className="grid gap-4 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill className={cn(health.ok ? 'text-green' : 'text-red')}>
          {health.ok ? 'ok' : 'stale'}
        </StatusPill>
        <Muted>
          newest snapshot {ageLabel(health.newestSnapshotAgeMinutes)} old · threshold{' '}
          {health.staleThresholdMinutes}m · checked {formatTs(health.checkedAt)}
        </Muted>
      </div>

      <AdminTable columns={ASSET_COLUMNS}>
        {health.assets.map((asset) => (
          <tr key={asset.symbol}>
            <AdminTd>{asset.symbol}</AdminTd>
            <AdminTd tone="muted">{formatTs(asset.newestSnapshotTs)}</AdminTd>
            <AdminTd className="tabular-nums">{ageLabel(asset.ageMinutes)}</AdminTd>
            <AdminTd className="tabular-nums">{asset.snapshots24h}</AdminTd>
            <AdminTd tone="small">
              <span className={asset.stale ? 'text-red' : 'text-green'}>
                {asset.stale ? 'stale' : 'fresh'}
              </span>
            </AdminTd>
          </tr>
        ))}
      </AdminTable>

      <AdminTable columns={COLLECTOR_COLUMNS}>
        {health.collectors.map((collector) => (
          <tr key={collector.source}>
            <AdminTd>{collector.source}</AdminTd>
            <AdminTd tone="muted">{formatTs(collector.lastSuccessAt)}</AdminTd>
            <AdminTd tone="muted">{formatTs(collector.lastAttemptAt)}</AdminTd>
            <AdminTd tone="small">
              {collector.lastError ? (
                <span className="text-red">{collector.lastError}</span>
              ) : (
                <span className="text-text-3">—</span>
              )}
            </AdminTd>
          </tr>
        ))}
        {health.collectors.length === 0 && (
          <tr>
            <AdminTd tone="muted" colSpan={4}>
              No collector status rows yet.
            </AdminTd>
          </tr>
        )}
      </AdminTable>

      <Muted as="p">
        News classification: {health.newsClassificationPaused ? 'paused' : 'running'} · forecast
        ingest: {health.forecastIngest.state}
        {health.forecastIngest.lastAcceptedAt
          ? ` (last accepted ${ageLabel(health.forecastIngest.lastAcceptedAgeMinutes)} ago)`
          : ''}
        {health.forecastIngest.lastRejectionReason
          ? ` · last rejection: ${health.forecastIngest.lastRejectionReason}`
          : ''}
      </Muted>
    </AdminBox>
  );
}
