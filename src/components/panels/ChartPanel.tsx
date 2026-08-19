'use client';

import { Surface } from '@heroui/react';
import { useState } from 'react';

import { ProjectionChart } from '@/components/dashboard/charts';
import { ForecastContextPanel } from '@/components/dashboard/ForecastContextPanel';
import { ForecastSettingsModal } from '@/components/dashboard/ForecastSettingsModal';
import { CoinSelect } from '@/components/ui/CoinSelect';
import { RANGE_OPTIONS } from '@/consts/projections';
import type { CoinListItem, ForecastSnapshot, ProjectionData } from '@/data/types';
import type { ScenarioOverride } from '@/hooks/useProjectionChart';
import { useProjectionChart } from '@/hooks/useProjectionChart';
import { formatPrice } from '@/lib/projectionSeries';

type ChartRange = (typeof RANGE_OPTIONS)[number];
type RangeTarget = 'history' | 'forecast';

interface ChartPanelProps {
  glow: number;
  projections: ProjectionData[] | null;
  selectedCoin: CoinListItem;
  setSelectedCoin: (c: CoinListItem) => void;
  isLoading: boolean;
  isStale: boolean;
  service: string;
  model: string;
  setService: (s: 'claude' | 'openai') => void;
  setModel: (m: string) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  refresh: (service: string, model: string) => Promise<void>;
  /** Generates a real AI forecast for just `selectedCoin` — the "Reforecast"
   * action, usable for any coin regardless of whether it's in the default
   * tracked batch. */
  onReforecast: () => Promise<void>;
  /** The Scenario Simulator's current sliders, drawn as an overlay line on
   * the chart so its effect is directly visible next to the AI forecast. */
  scenarioOverride?: ScenarioOverride | null;
  /** @deprecated use projections + selectedCoin instead */
  projData?: ProjectionData | null;
  snapshotOverride?: ProjectionData | null;
  snapshots: ForecastSnapshot[];
  onSaveSnapshot: (
    name: string,
    coin: string,
    projection: ProjectionData,
  ) => Promise<string | null>;
  onLoadSnapshot: (id: string) => void;
  onRenameSnapshot: (id: string, name: string) => Promise<void>;
  onRemoveSnapshot: (id: string) => Promise<void>;
}

/** Formats a scenario badge's price + %-vs-livePrice, e.g. "$314.8K · +27%".
 * Falls back to an em-dash when `value` is unavailable (no sane forecast). */
function formatBadgeValue(value: number | undefined, livePrice: number | undefined): string {
  if (value === undefined || livePrice === undefined || livePrice === 0) return '—';
  const pct = ((value - livePrice) / livePrice) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${formatPrice(value)} · ${sign}${Math.abs(pct).toFixed(0)}%`;
}

/** Plain-words age of a timestamp, e.g. "just now", "3 minutes ago", "2 hours ago". */
function formatAge(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
}

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function ChartPanel({
  glow,
  projections,
  selectedCoin,
  setSelectedCoin,
  isLoading,
  isStale,
  service,
  model,
  setService,
  setModel,
  isSettingsOpen,
  setIsSettingsOpen,
  refresh,
  onReforecast,
  scenarioOverride,
  projData: legacyProjData,
  snapshotOverride,
  snapshots,
  onSaveSnapshot,
  onLoadSnapshot,
  onRenameSnapshot,
  onRemoveSnapshot,
}: ChartPanelProps) {
  const [histRange, setHistRange] = useState<ChartRange>('3M');
  const [fcastRange, setFcastRange] = useState<ChartRange>('1M');
  const [rangeTarget, setRangeTarget] = useState<RangeTarget>('history');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const {
    rows: chartRows,
    yDomain: chartYDomain,
    todayMs,
    livePrice,
    histChange,
    badges,
    isLoading: isChartDataLoading,
    isStale: isChartDataStale,
    lastUpdatedAt,
    retry: retryChartData,
  } = useProjectionChart({
    coin: selectedCoin,
    histRange,
    fcastRange,
    projections,
    scenarioOverride,
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const coinSymbol = selectedCoin.symbol.toUpperCase();

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await onReforecast();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await retryChartData();
    } finally {
      setIsRetrying(false);
    }
  }

  const activeProjData =
    snapshotOverride ?? projections?.find((p) => p.coin === coinSymbol) ?? legacyProjData ?? null;

  const atSnapshotLimit = snapshots.length >= 5;

  async function handleSaveConfirm() {
    if (!activeProjData) return;
    setSaveError(null);
    const err = await onSaveSnapshot(
      saveName.trim() || `${coinSymbol} forecast`,
      coinSymbol,
      activeProjData,
    );
    if (err) {
      setSaveError(err);
    } else {
      setSaveName('');
      setIsSavePromptOpen(false);
    }
  }

  if (isLoading || isChartDataLoading) {
    return (
      <Surface className="card glow-violet area-chart animate-pulse">
        <div className="card-header">
          <div
            style={{ height: 14, width: '40%', borderRadius: 4, background: 'var(--surface-3)' }}
          />
        </div>
        <div
          style={{
            height: 320,
            borderRadius: 'var(--radius)',
            background: 'var(--surface-3)',
            marginTop: 12,
          }}
        />
      </Surface>
    );
  }

  return (
    <>
      <Surface className="card glow-violet area-chart">
        <div className="card-header">
          <div className="row chart-head-row" style={{ gap: 14 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="marker"></span>
              {coinSymbol} price forecast
              <button
                className="btn-ghost"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Open forecast settings"
                style={{ padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}
              >
                <GearIcon />
              </button>
            </div>
            <div className="chart-head-coin" style={{ marginLeft: 'auto' }}>
              <CoinSelect value={selectedCoin} onChange={setSelectedCoin} />
            </div>
          </div>
          <div className="row chart-legend-row">
            <div className="legend">
              <span>
                <span className="sw" style={{ background: 'oklch(0.86 0.20 145)' }}></span>Bull case
              </span>
              <span>
                <span className="sw" style={{ background: 'oklch(0.78 0.22 295)' }}></span>Base case
              </span>
              <span>
                <span className="sw" style={{ background: 'oklch(0.65 0.18 25)' }}></span>Bear case
              </span>
              {scenarioOverride && (
                <span>
                  <span className="sw" style={{ background: 'oklch(0.80 0.18 85)' }}></span>Your
                  scenario
                </span>
              )}
            </div>
            <div className="chart-tabs" style={{ alignItems: 'center', gap: 6 }}>
              {RANGE_OPTIONS.map((r) => {
                const isActive = rangeTarget === 'history' ? histRange === r : fcastRange === r;
                return (
                  <button
                    key={r}
                    className={isActive ? 'active' : ''}
                    onClick={() => (rangeTarget === 'history' ? setHistRange(r) : setFcastRange(r))}
                  >
                    {r}
                  </button>
                );
              })}
              <button
                className="btn-primary"
                onClick={() => setRangeTarget((t) => (t === 'history' ? 'forecast' : 'history'))}
                aria-label={`Range target: ${rangeTarget}. Click to switch to ${rangeTarget === 'history' ? 'forecast' : 'history'}.`}
                title="Toggle whether the range buttons apply to the history or forecast range"
                style={{ padding: '4px 10px', fontSize: 10, marginLeft: 4 }}
              >
                {rangeTarget === 'history' ? 'History ▾' : 'Forecast ▾'}
              </button>
            </div>
          </div>
        </div>
        <div
          className="row chart-price-row"
          style={{ alignItems: 'baseline', gap: 18, marginBottom: 6 }}
        >
          <div
            style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em' }}
            className="tnum glow-text-violet"
          >
            {livePrice !== undefined ? formatPrice(livePrice) : '$—'}
          </div>
          {histChange.label && (
            <>
              <div className={`mono ${histChange.abs >= 0 ? 'delta-up' : 'delta-dn'}`}>
                {histChange.abs >= 0 ? '+' : '−'} $
                {Math.abs(histChange.abs).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                · {Math.abs(histChange.pct).toFixed(2)}%
              </div>
              <div className="muted small">{histChange.label}</div>
            </>
          )}
          <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <button
                className="btn-ghost"
                onClick={() => {
                  if (!atSnapshotLimit) {
                    setSaveError(null);
                    setIsSavePromptOpen((v) => !v);
                  }
                }}
                disabled={atSnapshotLimit || !activeProjData}
                title={
                  atSnapshotLimit ? 'Delete a saved forecast to save a new one' : 'Save snapshot'
                }
                style={{ opacity: atSnapshotLimit || !activeProjData ? 0.45 : 1 }}
              >
                Save snapshot
              </button>
              {isSavePromptOpen && !atSnapshotLimit && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 200,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--surface-3)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minWidth: 220,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    placeholder={`${coinSymbol} forecast`}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveConfirm();
                      if (e.key === 'Escape') {
                        setIsSavePromptOpen(false);
                        setSaveName('');
                      }
                    }}
                    style={{
                      background: 'var(--surface-3)',
                      border: '1px solid var(--surface-3)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--fg)',
                      fontSize: 13,
                      padding: '6px 10px',
                      outline: 'none',
                    }}
                  />
                  {saveError && (
                    <span style={{ fontSize: 11, color: 'var(--red)' }}>{saveError}</span>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-ghost"
                      onClick={() => void handleSaveConfirm()}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: 13,
                        background: 'oklch(0.78 0.22 295 / 0.15)',
                        border: '1px solid oklch(0.78 0.22 295)',
                        color: 'oklch(0.78 0.22 295)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setIsSavePromptOpen(false);
                        setSaveName('');
                        setSaveError(null);
                      }}
                      style={{ padding: '5px 10px', fontSize: 13 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="btn-ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title={`Generate a fresh AI forecast for ${coinSymbol}`}
              style={{ opacity: isRefreshing ? 0.6 : 1 }}
            >
              {isRefreshing ? 'Reforecasting…' : 'Reforecast'}
            </button>
          </div>
        </div>
        {isChartDataStale && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'oklch(0.65 0.18 60 / 0.15)',
              border: '1px solid oklch(0.65 0.18 60 / 0.35)',
              color: 'oklch(0.85 0.15 60)',
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            <span>
              Data may be outdated
              {lastUpdatedAt !== null ? ` — last updated ${formatAge(lastUpdatedAt)}` : ''}
            </span>
            <button
              className="btn-ghost"
              onClick={() => void handleRetry()}
              disabled={isRetrying}
              style={{
                marginLeft: 'auto',
                padding: '2px 10px',
                fontSize: 11,
                opacity: isRetrying ? 0.6 : 1,
              }}
            >
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        <div className="chart-stage">
          <ProjectionChart glow={glow} rows={chartRows} yDomain={chartYDomain} todayMs={todayMs} />
          <div
            className="scenario-tag"
            style={{ top: 18, right: 56, color: 'oklch(0.86 0.20 145)' }}
          >
            <span className="dot" style={{ background: 'oklch(0.86 0.20 145)' }}></span>
            Bull · {formatBadgeValue(badges.bull, livePrice)}
          </div>
          <div
            className="scenario-tag"
            style={{ top: 130, right: 56, color: 'oklch(0.78 0.22 295)' }}
          >
            <span className="dot" style={{ background: 'oklch(0.78 0.22 295)' }}></span>
            Base · {formatBadgeValue(badges.base, livePrice)}
          </div>
          <div
            className="scenario-tag"
            style={{ top: 232, right: 56, color: 'oklch(0.65 0.18 25)' }}
          >
            <span className="dot" style={{ background: 'oklch(0.65 0.18 25)' }}></span>
            Bear · {formatBadgeValue(badges.bear, livePrice)}
          </div>
        </div>
        <ForecastContextPanel projData={activeProjData} isStale={isStale} />
      </Surface>
      <ForecastSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        service={service as 'claude' | 'openai'}
        model={model}
        setService={setService}
        setModel={setModel}
        refresh={refresh}
        snapshots={snapshots}
        onLoadSnapshot={onLoadSnapshot}
        onRenameSnapshot={onRenameSnapshot}
        onRemoveSnapshot={onRemoveSnapshot}
      />
    </>
  );
}
