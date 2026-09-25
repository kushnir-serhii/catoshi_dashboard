'use client';

import type { ProjectionData } from '@/data/types';

function formatRelativeTime(isoString: string): string {
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here. This
  // is a live age — `now - generatedAt` — where `generatedAt` (the data
  // timestamp) is the other operand, so the label tells the true age of the
  // forecast and moves as the forecast ages. It is NOT the shipped defect
  // (`decisions.md` §3, instance 2), which was a "last updated" label set to the
  // render moment *instead of* reading a data timestamp.
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

export function ForecastContextPanel({ projData }: ForecastContextPanelProps) {
  if (!projData) {
    return (
      <div className="forecast-context animate-pulse" style={{ marginTop: 'var(--sp-3)' }}>
        <div
          style={{ height: 14, width: '30%', borderRadius: 'var(--radius-sm)', background: 'var(--surface-3)' }}
        />
        <div
          style={{
            height: 12,
            width: '60%',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-3)',
            marginTop: 'var(--sp-2)',
          }}
        />
        <div
          style={{
            height: 12,
            width: '80%',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-3)',
            marginTop: 'var(--sp-2)',
          }}
        />
      </div>
    );
  }

  // Producer of the displayed batch (spec 020 §2.5). A routine ingest is the
  // normal case after spec 020; "Produced on demand" showing up repeatedly is
  // the visible symptom of a dead schedule and must be legible here, not only
  // in a bill or a log.
  const isScheduled = projData.service === 'routine';
  const producerLabel = isScheduled ? 'Scheduled analysis' : 'Produced on demand';
  const serviceName = projData.service === 'claude' ? 'Claude' : 'OpenAI';
  const badgeLabel = isScheduled ? 'Scheduled analysis' : `${serviceName} · ${projData.model}`;
  const relativeTime = formatRelativeTime(projData.generatedAt);
  const reasoningText = projData.reasoning.join(' · ');

  return (
    <div className="forecast-context" style={{ marginTop: 'var(--sp-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
          <span
            style={{
              fontSize: 'var(--fs-lg)',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--green)',
              letterSpacing: 'var(--ls-tight)',
            }}
          >
            {projData.confidence}%
          </span>
          <span className="muted small">confidence</span>
        </div>

        {projData.scenarioProbabilities && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              fontSize: 'var(--fs-sm)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ color: 'var(--color-chart-bull)' }}>
              Bull {projData.scenarioProbabilities.bull}%
            </span>
            <span style={{ color: 'var(--color-chart-base)' }}>
              Base {projData.scenarioProbabilities.base}%
            </span>
            <span style={{ color: 'var(--color-chart-bear)' }}>
              Bear {projData.scenarioProbabilities.bear}%
            </span>
          </div>
        )}

        <span className="muted small">{producerLabel}</span>
        <span className="muted small">{relativeTime}</span>

        <span
          style={{
            fontSize: 'var(--fs-xs)',
            padding: 'var(--sp-0) var(--sp-2)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-3)',
            color: 'var(--text-2)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {reasoningText && (
        <p className="muted small" style={{ marginTop: 'var(--sp-2)', lineHeight: 'var(--lh-normal)', marginBottom: 0 }}>
          {reasoningText}
        </p>
      )}
    </div>
  );
}
