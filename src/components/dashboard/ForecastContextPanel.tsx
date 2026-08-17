'use client';

import type { ProjectionData } from '@/data/types';

function formatRelativeTime(isoString: string): string {
  const generated = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = now - generated;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  return `Updated ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
}

interface ForecastContextPanelProps {
  projData: ProjectionData | null;
  isStale: boolean;
}

export function ForecastContextPanel({ projData, isStale }: ForecastContextPanelProps) {
  if (!projData) {
    return (
      <div className="forecast-context animate-pulse" style={{ marginTop: 12 }}>
        <div style={{ height: 14, width: '30%', borderRadius: 4, background: 'var(--surface-3)' }} />
        <div style={{ height: 12, width: '60%', borderRadius: 4, background: 'var(--surface-3)', marginTop: 8 }} />
        <div style={{ height: 12, width: '80%', borderRadius: 4, background: 'var(--surface-3)', marginTop: 6 }} />
      </div>
    );
  }

  const serviceName = projData.service === 'claude' ? 'Claude' : 'OpenAI';
  const badgeLabel = `${serviceName} · ${projData.model}`;
  const relativeTime = formatRelativeTime(projData.generatedAt);
  const reasoningText = projData.reasoning.join(' · ');

  return (
    <div className="forecast-context" style={{ marginTop: 12 }}>
      {isStale && (
        <div
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'oklch(0.65 0.18 60 / 0.15)',
            border: '1px solid oklch(0.65 0.18 60 / 0.35)',
            color: 'oklch(0.85 0.15 60)',
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          Forecast may be outdated
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--green)',
              letterSpacing: '-0.02em',
            }}
          >
            {projData.confidence}%
          </span>
          <span className="muted small">confidence</span>
        </div>

        <span className="muted small">{relativeTime}</span>

        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-3)',
            color: 'var(--text-2)',
            fontFamily: 'var(--font-geist-mono), "Geist Mono", ui-monospace, monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {reasoningText && (
        <p
          className="muted small"
          style={{ marginTop: 6, lineHeight: 1.5, marginBottom: 0 }}
        >
          {reasoningText}
        </p>
      )}
    </div>
  );
}
