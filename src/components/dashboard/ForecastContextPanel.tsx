'use client';

import { Muted } from '@/components/ui/Muted';
import { Skeleton } from '@/components/ui/Skeleton';
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
      <div className="forecast-context mt-3 space-y-2">
        <Skeleton className="h-3.5 w-3/10 rounded-sm" />
        <Skeleton className="h-3 w-3/5 rounded-sm" />
        <Skeleton className="h-3 w-4/5 rounded-sm" />
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
    <div className="forecast-context mt-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-green text-lg font-semibold tracking-(--ls-tight) tabular-nums">
            {projData.confidence}%
          </span>
          <Muted>confidence</Muted>
        </div>

        {projData.scenarioProbabilities && (
          <div className="flex items-center gap-3 text-sm tabular-nums">
            <span className="text-chart-bull">Bull {projData.scenarioProbabilities.bull}%</span>
            <span className="text-chart-base">Base {projData.scenarioProbabilities.base}%</span>
            <span className="text-chart-bear">Bear {projData.scenarioProbabilities.bear}%</span>
          </div>
        )}

        {/* The badge already says "Scheduled analysis"; only the on-demand case needs the extra label. */}
        {!isScheduled && <Muted>{producerLabel}</Muted>}
        <Muted>{relativeTime}</Muted>

        <span className="bg-surface-3 text-text-2 rounded-sm px-2 py-0.5 font-mono text-xs whitespace-nowrap">
          {badgeLabel}
        </span>
      </div>

      {reasoningText && (
        <p className="text-text-3 mt-2 text-sm leading-(--lh-normal)">{reasoningText}</p>
      )}
    </div>
  );
}
