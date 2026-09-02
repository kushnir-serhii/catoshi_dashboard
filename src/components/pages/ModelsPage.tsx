'use client';

import { MIN_SCORED_SAMPLE_SIZE, NO_SKILL_BRIER_BASELINE } from '@/consts/scoring';
import type { ModelCalibrationGroup, ModelsExclusionSummary, ModelTrendPoint } from '@/data/types';
import { useModels } from '@/hooks/useModels';

const CARD_BOX: React.CSSProperties = {
  padding: '20px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--surface-3)',
};

function Notice({ tone, title, body }: { tone: 'error' | 'quiet'; title: string; body: string }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        borderRadius: 12,
        background: 'var(--surface-2)',
        border:
          tone === 'error' ? '1px solid oklch(0.6 0.18 20 / 0.45)' : '1px solid var(--surface-3)',
      }}
    >
      <h4
        style={{
          fontSize: 15,
          marginBottom: 8,
          color: tone === 'error' ? 'var(--red)' : 'var(--text)',
        }}
      >
        {title}
      </h4>
      <p className="small muted" style={{ margin: '0 auto', maxWidth: 460, lineHeight: 1.6 }}>
        {body}
      </p>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span className="marker"></span>Forecast accuracy
        </div>
      </div>
      <div className="animate-pulse" style={CARD_BOX}>
        <div
          style={{
            height: 14,
            width: 160,
            background: 'var(--surface-3)',
            borderRadius: 4,
            marginBottom: 16,
          }}
        />
        <div
          style={{
            height: 40,
            width: 220,
            background: 'var(--surface-3)',
            borderRadius: 4,
            marginBottom: 12,
          }}
        />
        <div
          style={{ height: 60, width: '100%', background: 'var(--surface-3)', borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

/** Month-over-month mean Brier, drawn against the no-skill baseline. Lower is better. */
function BrierTrend({ points }: { points: ModelTrendPoint[] }) {
  const width = 320;
  const height = 96;
  const padX = 6;
  const padY = 10;

  const values = points.map((p) => p.meanBrier);
  const yMax = Math.max(NO_SKILL_BRIER_BASELINE, ...values) * 1.15;
  const yMin = 0;

  const x = (i: number): number =>
    points.length <= 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - 2 * padX);
  const y = (v: number): number =>
    height - padY - ((v - yMin) / (yMax - yMin || 1)) * (height - 2 * padY);

  const baselineY = y(NO_SKILL_BRIER_BASELINE);
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.meanBrier).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
      role="img"
      aria-label="Mean Brier score by month against the no-skill baseline"
    >
      <line
        x1={padX}
        x2={width - padX}
        y1={baselineY}
        y2={baselineY}
        stroke="var(--text-3)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text
        x={padX}
        y={baselineY - 4}
        fontSize="10"
        fill="var(--text-3)"
        fontFamily="var(--font-mono)"
      >
        baseline {NO_SKILL_BRIER_BASELINE}
      </text>
      {points.length > 1 && (
        <path d={linePath} fill="none" stroke="oklch(0.78 0.22 295)" strokeWidth="1.6" />
      )}
      {points.map((p, i) => (
        <circle
          key={p.month}
          cx={x(i)}
          cy={y(p.meanBrier)}
          r={3}
          fill={p.meanBrier <= NO_SKILL_BRIER_BASELINE ? 'var(--green)' : 'var(--red)'}
        />
      ))}
    </svg>
  );
}

function formatMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function GroupExclusionLine({ group }: { group: ModelCalibrationGroup }) {
  if (group.excludedCount === 0) {
    return (
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        No resolved outcomes were set aside for this series.
      </p>
    );
  }
  const parts: string[] = [];
  if (group.excludedUnlinked > 0) parts.push(`${group.excludedUnlinked} with no linked snapshot`);
  if (group.excludedBackfilled > 0)
    parts.push(`${group.excludedBackfilled} on a back-filled snapshot`);
  if (group.excludedUnscoreable > 0) parts.push(`${group.excludedUnscoreable} unscoreable`);
  return (
    <p className="small muted" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
      {group.excludedCount} of {group.totalOutcomes} resolved outcomes set aside
      {parts.length > 0 ? `: ${parts.join(', ')}` : ''}.
    </p>
  );
}

function GroupCard({ group }: { group: ModelCalibrationGroup }) {
  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{group.model}</span>
      <span
        className="small"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-3)',
          background: 'var(--surface-3)',
          borderRadius: 999,
          padding: '2px 8px',
        }}
      >
        prompt {group.promptVersion}
      </span>
    </div>
  );

  // Below the minimum sample size the page reports the count, never a mean
  // (functional-spec 2.7). This is the expected early state.
  if (group.meanBrier === null || group.scoredCount < MIN_SCORED_SAMPLE_SIZE) {
    return (
      <div style={CARD_BOX}>
        {header}
        <p className="small" style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          {group.scoredCount} forecast{group.scoredCount === 1 ? '' : 's'} resolved, too few to
          report accuracy — {MIN_SCORED_SAMPLE_SIZE} scored outcomes are needed before a mean Brier
          score is more signal than noise.
        </p>
        <GroupExclusionLine group={group} />
      </div>
    );
  }

  const beating = group.meanBrier < NO_SKILL_BRIER_BASELINE;
  const delta = Math.abs(group.meanBrier - NO_SKILL_BRIER_BASELINE);

  return (
    <div style={CARD_BOX}>
      {header}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="small muted" style={{ marginBottom: 2 }}>
            Mean Brier score
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 500,
              fontFeatureSettings: '"tnum"',
              color: beating ? 'var(--green)' : 'var(--red)',
              lineHeight: 1.1,
            }}
          >
            {group.meanBrier.toFixed(3)}
          </div>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 2 }}>
            No-skill baseline
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 400,
              fontFeatureSettings: '"tnum"',
              color: 'var(--text-3)',
              lineHeight: 1.1,
            }}
          >
            {NO_SKILL_BRIER_BASELINE.toFixed(3)}
          </div>
        </div>
      </div>
      <p
        className="small"
        style={{ margin: '10px 0 0', color: beating ? 'var(--green)' : 'var(--red)' }}
      >
        {beating ? 'Beating' : 'Below'} the no-skill baseline by {delta.toFixed(3)}
      </p>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        Based on {group.scoredCount} scored outcome{group.scoredCount === 1 ? '' : 's'}.
      </p>

      {group.trend.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Trend by month (lower is better; goal is a score that falls)
          </div>
          <BrierTrend points={group.trend} />
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
            {group.trend.map((p) => (
              <span
                key={p.month}
                className="small muted"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {formatMonth(p.month)}: {p.meanBrier.toFixed(3)} (n={p.scoredCount})
              </span>
            ))}
          </div>
        </div>
      )}

      <GroupExclusionLine group={group} />
    </div>
  );
}

function ExclusionsSummary({ exclusions }: { exclusions: ModelsExclusionSummary }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span className="marker"></span>What was set aside
        </div>
      </div>
      <div style={CARD_BOX}>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {exclusions.totalOutcomes} resolved outcome{exclusions.totalOutcomes === 1 ? '' : 's'} in
          total. {exclusions.scoredCount} counted toward a score; {exclusions.excludedCount}{' '}
          excluded — {exclusions.excludedUnlinked} with no linked snapshot,{' '}
          {exclusions.excludedBackfilled} linked to a back-filled snapshot,{' '}
          {exclusions.excludedUnscoreable} unscoreable (no realized scenario or no probabilities).
        </p>
      </div>
    </div>
  );
}

export function ModelsPage() {
  const { groups, exclusions, fetchError, isLoading, isStale } = useModels();

  const hasAnyOutcome = groups.length > 0 || (exclusions?.totalOutcomes ?? 0) > 0;

  return (
    <div className="page-content">
      {isStale && (
        <div
          className="small"
          style={{
            marginBottom: 12,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--surface-3)',
            border: '1px solid oklch(0.65 0.15 55 / 0.4)',
            color: 'oklch(0.75 0.12 55)',
          }}
        >
          Data may be outdated
        </div>
      )}

      {isLoading ? (
        <PageSkeleton />
      ) : fetchError ? (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="marker"></span>Forecast accuracy
            </div>
          </div>
          <Notice
            tone="error"
            title="Calibration data could not be read"
            body="The forecast-scoring store is unavailable, so no accuracy figures can be shown. This is not a measured result — check back shortly."
          />
        </div>
      ) : !hasAnyOutcome ? (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="marker"></span>Forecast accuracy
            </div>
          </div>
          <Notice
            tone="quiet"
            title="No forecasts have been resolved yet"
            body="The system has not yet measured any forecast accuracy. Scores will appear here once forecasts reach their horizon and are scored against real prices."
          />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="marker"></span>Forecast accuracy, by model and prompt version
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {groups.map((group) => (
                <GroupCard key={`${group.model}::${group.promptVersion}`} group={group} />
              ))}
            </div>
          </div>
          {exclusions && <ExclusionsSummary exclusions={exclusions} />}
        </>
      )}
    </div>
  );
}
