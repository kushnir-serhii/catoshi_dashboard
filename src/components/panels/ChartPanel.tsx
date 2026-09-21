'use client';

import { Surface } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { ProjectionChart } from '@/components/dashboard/charts';
import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton';
import { ForecastContextPanel } from '@/components/dashboard/ForecastContextPanel';
import { ForecastModeIndicator } from '@/components/dashboard/ForecastModeIndicator';
import { ForecastSettingsModal } from '@/components/dashboard/ForecastSettingsModal';
import { SignInInviteModal } from '@/components/dashboard/SignInInviteModal';
import { CoinSelect } from '@/components/ui/CoinSelect';
import { DEFAULT_FORECAST_TARGETS, RANGE_OPTIONS } from '@/consts/projections';
import type { CoinListItem, ForecastSnapshot, ProjectionData } from '@/data/types';
import { useProjectionChart } from '@/hooks/useProjectionChart';
import { describeRefreshError, exhaustedAllowanceMessage } from '@/hooks/useProjections';
import { useSession } from '@/hooks/useSession';
import { formatPrice } from '@/lib/projectionSeries';

const TAG_OFFSET_KEY = 'catoshi.scenarioTagOffset.';

/** A scenario badge the user can drag anywhere over the chart. The offset is
 * a translate from the badge's default slot, remembered per browser;
 * double-click puts it back. */
function DraggableTag({ id, label }: { id: 'bull' | 'base' | 'bear'; label: string }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const color = `var(--color-chart-${id})`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAG_OFFSET_KEY + id);
      if (raw) setOffset(JSON.parse(raw));
    } catch {
      // storage unavailable — default position
    }
  }, [id]);

  const save = (o: { x: number; y: number }) => {
    try {
      if (o.x === 0 && o.y === 0) localStorage.removeItem(TAG_OFFSET_KEY + id);
      else localStorage.setItem(TAG_OFFSET_KEY + id, JSON.stringify(o));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`scenario-tag ${id}`}
      title="Drag to move · double-click to reset"
      style={{
        color,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        pointerEvents: 'auto',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        zIndex: dragging ? 2 : 1,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        setOffset({ x: s.ox + e.clientX - s.px, y: s.oy + e.clientY - s.py });
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
        save(offset);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => {
        const zero = { x: 0, y: 0 };
        setOffset(zero);
        save(zero);
      }}
    >
      <span className="dot" style={{ background: color }}></span>
      {label}
    </div>
  );
}

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
  setServiceAndModel: (s: 'claude' | 'openai', m: string) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  refresh: (service: string, model: string) => Promise<void>;
  /** Generates a real AI forecast for just `selectedCoin` — the "Reforecast"
   * action, usable for any coin regardless of whether it's in the default
   * tracked batch. */
  onReforecast: () => Promise<void>;
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
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here. This
  // is a live age — `now - timestampMs` — where `timestampMs` is the moment a
  // genuinely new live price/history value last arrived (set in an effect only
  // when the value actually changes, see `useProjectionChart`). Live CoinGecko
  // prices carry no upstream timestamp, so "when we last received a fresh value"
  // is the honest freshness signal, and the age recomputes as it should on
  // re-render. Not the shipped defect: the label never claims freshness the data
  // does not have.
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
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
  setServiceAndModel,
  isSettingsOpen,
  setIsSettingsOpen,
  refresh,
  onReforecast,
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
    forecastUnavailable,
    forecastAnchorPrice,
    isLoading: isChartDataLoading,
    isStale: isChartDataStale,
    lastUpdatedAt,
    retry: retryChartData,
  } = useProjectionChart({
    coin: selectedCoin,
    histRange,
    fcastRange,
    projections,
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reforecastError, setReforecastError] = useState<string | null>(null);
  const [isSignInInviteOpen, setIsSignInInviteOpen] = useState(false);
  const { session } = useSession();
  const role = session?.role ?? 'guest';
  const isGuest = role === 'guest';
  const remaining = session?.remaining ?? null;
  const reforecastLabel =
    role === 'user' && remaining !== null ? `Reforecast — ${remaining} left today` : 'Reforecast';

  const coinSymbol = selectedCoin.symbol.toUpperCase();
  const isOffBatchCoin = !DEFAULT_FORECAST_TARGETS.some((t) => t.symbol === coinSymbol);

  async function handleRefresh() {
    // Guests: the button stays enabled and un-greyed, but pressing it invites
    // sign-in instead of calling the API (spec 022, §2.3). No forecast is fired
    // optimistically after sign-in — the user presses again deliberately.
    if (isGuest) {
      setIsSignInInviteOpen(true);
      return;
    }
    // Client-side courtesy: a user at zero sees the exhausted message with the
    // reset time without a round-trip. The server refuses independently.
    if (role === 'user' && remaining === 0) {
      setReforecastError(exhaustedAllowanceMessage(session?.resetsAt ?? null));
      return;
    }
    setIsRefreshing(true);
    setReforecastError(null);
    try {
      await onReforecast();
    } catch (err) {
      setReforecastError(describeRefreshError(err));
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
            style={{
              height: 14,
              width: '40%',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-3)',
            }}
          />
        </div>
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <ChartSkeleton />
        </div>
      </Surface>
    );
  }

  return (
    <>
      <Surface className="card glow-violet area-chart">
        <div className="card-header chart-card-header">
          <div className="chart-head-row">
            <div className="chart-head-coin">
              <CoinSelect value={selectedCoin} onChange={setSelectedCoin} />
            </div>
            {/* <ForecastModeIndicator
              service={service}
              model={model}
              onOpen={() => setIsSettingsOpen(true)}
            /> */}
          </div>
          <div className="chart-legend-row">
            <div className="legend">
              <span>
                <span className="sw" style={{ background: 'var(--color-chart-bull)' }}></span>Bull
                case
                {activeProjData?.scenarioProbabilities &&
                  ` (${activeProjData.scenarioProbabilities.bull}%)`}
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--color-chart-base)' }}></span>Base
                case
                {activeProjData?.scenarioProbabilities &&
                  ` (${activeProjData.scenarioProbabilities.base}%)`}
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--color-chart-bear)' }}></span>Bear
                case
                {activeProjData?.scenarioProbabilities &&
                  ` (${activeProjData.scenarioProbabilities.bear}%)`}
              </span>
            </div>
            <div className="chart-range">
              <button
                type="button"
                className="chart-range-target"
                onClick={() => setRangeTarget((t) => (t === 'history' ? 'forecast' : 'history'))}
                aria-label={`Range applies to ${rangeTarget}. Click to switch to ${rangeTarget === 'history' ? 'forecast' : 'history'}.`}
                title="Toggle whether the range buttons apply to the history or forecast range"
              >
                {rangeTarget === 'history' ? 'History' : 'Forecast'}{' '}
                <span aria-hidden="true">▾</span>
              </button>
              <div className="chart-tabs">
                {RANGE_OPTIONS.map((r) => {
                  const isActive = rangeTarget === 'history' ? histRange === r : fcastRange === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      className={isActive ? 'active' : ''}
                      onClick={() =>
                        rangeTarget === 'history' ? setHistRange(r) : setFcastRange(r)
                      }
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div
          className="row chart-price-row"
          style={{ alignItems: 'baseline', gap: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}
        >
          <div
            style={{ fontSize: 'var(--fs-xl)', fontWeight: 500, letterSpacing: 'var(--ls-tight)' }}
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
          <div
            className="right"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
          >
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
                    zIndex: 'var(--z-popover)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--surface-3)',
                    borderRadius: 'var(--radius)',
                    padding: 'var(--sp-3) var(--sp-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--sp-2)',
                    minWidth: 220,
                    boxShadow: 'var(--shadow-raised)',
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
                      color: 'var(--text)',
                      fontSize: 'var(--fs-base)',
                      padding: 'var(--sp-2) var(--sp-3)',
                      outline: 'none',
                    }}
                  />
                  {saveError && (
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--red)' }}>
                      {saveError}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <button
                      className="btn-ghost"
                      onClick={() => void handleSaveConfirm()}
                      style={{
                        flex: 1,
                        padding: 'var(--sp-1) 0',
                        fontSize: 'var(--fs-sm)',
                        background: 'var(--color-selected-soft)',
                        border: '1px solid var(--color-chart-base)',
                        color: 'var(--color-chart-base)',
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
                      style={{ padding: 'var(--sp-1) var(--sp-3)', fontSize: 'var(--fs-sm)' }}
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
              {isRefreshing ? 'Reforecasting…' : reforecastLabel}
            </button>
          </div>
        </div>
        {isOffBatchCoin && (
          <div className="muted small" style={{ marginBottom: 'var(--sp-3)' }}>
            Session-only: {coinSymbol} has no stored history, so this forecast isn&apos;t saved and
            won&apos;t survive a reload.
          </div>
        )}
        {forecastUnavailable !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-selected-softer)',
              border: '1px solid oklch(0.78 0.22 295 / 0.35)',
              color: 'oklch(0.85 0.12 295)',
              fontSize: 'var(--fs-sm)',
              marginBottom: 'var(--sp-3)',
            }}
          >
            <span>
              {forecastUnavailable === 'no-forecast'
                ? `No AI forecast for ${coinSymbol} yet — the bull/base/bear lines appear once one is generated.`
                : `Forecast hidden: it was generated around ${
                    forecastAnchorPrice !== undefined
                      ? formatPrice(forecastAnchorPrice)
                      : 'an unknown price'
                  }, too far from the live price to anchor. Reforecast to redraw the scenario lines.`}
            </span>
            <button
              className="btn-ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                marginLeft: 'auto',
                padding: 'var(--sp-0) var(--sp-3)',
                fontSize: 'var(--fs-xs)',
                opacity: isRefreshing ? 0.6 : 1,
              }}
            >
              {isRefreshing ? 'Reforecasting…' : 'Reforecast'}
            </button>
          </div>
        )}
        {reforecastError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--radius-sm)',
              background: 'oklch(0.65 0.18 25 / 0.15)',
              border: '1px solid oklch(0.65 0.18 25 / 0.35)',
              color: 'oklch(0.75 0.18 25)',
              fontSize: 'var(--fs-sm)',
              marginBottom: 'var(--sp-3)',
            }}
          >
            <span>{reforecastError}</span>
          </div>
        )}
        {isChartDataStale && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-notice-bg)',
              border: '1px solid var(--color-notice-border)',
              color: 'var(--color-notice)',
              fontSize: 'var(--fs-sm)',
              marginBottom: 'var(--sp-3)',
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
                padding: 'var(--sp-0) var(--sp-3)',
                fontSize: 'var(--fs-xs)',
                opacity: isRetrying ? 0.6 : 1,
              }}
            >
              {isRetrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        <div className="chart-stage-wrap">
          <div className="chart-stage">
            <ProjectionChart
              glow={glow}
              rows={chartRows}
              yDomain={chartYDomain}
              todayMs={todayMs}
            />
          </div>
          {/* The three scenario values. Absolutely positioned over the chart on a
            wide screen; below ~640px the chart is only 180px tall and they were
            simply hidden, which removed the forecast's actual numbers from the
            phone entirely. They now reflow into a row under the chart instead. */}
          <div className="scenario-tags">
            <DraggableTag
              id="bull"
              label={`Bull · ${formatBadgeValue(badges.bull, livePrice)}${
                activeProjData?.scenarioProbabilities
                  ? ` · ${activeProjData.scenarioProbabilities.bull}% likely`
                  : ''
              }`}
            />
            <DraggableTag
              id="base"
              label={`Base · ${formatBadgeValue(badges.base, livePrice)}${
                activeProjData?.scenarioProbabilities
                  ? ` · ${activeProjData.scenarioProbabilities.base}% likely`
                  : ''
              }`}
            />
            <DraggableTag
              id="bear"
              label={`Bear · ${formatBadgeValue(badges.bear, livePrice)}${
                activeProjData?.scenarioProbabilities
                  ? ` · ${activeProjData.scenarioProbabilities.bear}% likely`
                  : ''
              }`}
            />
          </div>
        </div>
        <ForecastContextPanel projData={activeProjData} isStale={isStale} />
      </Surface>
      <SignInInviteModal isOpen={isSignInInviteOpen} onClose={() => setIsSignInInviteOpen(false)} />
      <ForecastSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        service={service as 'claude' | 'openai'}
        model={model}
        setServiceAndModel={setServiceAndModel}
        refresh={refresh}
        snapshots={snapshots}
        onLoadSnapshot={onLoadSnapshot}
        onRenameSnapshot={onRenameSnapshot}
        onRemoveSnapshot={onRemoveSnapshot}
      />
    </>
  );
}
