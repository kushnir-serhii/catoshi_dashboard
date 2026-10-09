'use client';

import { useState } from 'react';

import { ForecastContextPanel } from '@/components/dashboard/ForecastContextPanel';
import { ForecastSettingsModal } from '@/components/dashboard/ForecastSettingsModal';
import { SignInInviteModal } from '@/components/dashboard/SignInInviteModal';
import { Card } from '@/components/ui';
import { DEFAULT_FORECAST_TARGETS } from '@/consts/projections';
import type { CoinListItem, ForecastSnapshot, ProjectionData } from '@/data/types';
import { useProjectionChart } from '@/hooks/useProjectionChart';
import { describeRefreshError, exhaustedAllowanceMessage } from '@/hooks/useProjections';
import { useSession } from '@/hooks/useSession';

import { ChartNotices } from './ChartNotices';
import { ChartPanelHeader } from './ChartPanelHeader';
import { ChartPanelSkeleton } from './ChartPanelSkeleton';
import { ChartStage } from './ChartStage';
import { PriceRow } from './PriceRow';
import { type ChartRange, type RangeTarget } from './RangeControls';
import { SaveSnapshotPopover } from './SaveSnapshotPopover';

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
  const [histRange, setHistRange] = useState<ChartRange>('1M');
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

  if (isLoading || isChartDataLoading) return <ChartPanelSkeleton />;

  const closeSavePrompt = () => {
    setIsSavePromptOpen(false);
    setSaveName('');
    setSaveError(null);
  };

  return (
    <>
      <Card glow className="[grid-area:chart] max-sm:p-3">
        <ChartPanelHeader
          selectedCoin={selectedCoin}
          onSelectCoin={setSelectedCoin}
          probabilities={activeProjData?.scenarioProbabilities}
          rangeTarget={rangeTarget}
          onToggleRangeTarget={() =>
            setRangeTarget((t) => (t === 'history' ? 'forecast' : 'history'))
          }
          activeRange={rangeTarget === 'history' ? histRange : fcastRange}
          onRangeChange={rangeTarget === 'history' ? setHistRange : setFcastRange}
        />
        <PriceRow
          livePrice={livePrice}
          histChange={histChange}
          actions={
            <div className="relative">
              {/* Save snapshot / Reforecast buttons are intentionally disabled for now:
                <Button onClick={toggleSavePrompt} disabled={atSnapshotLimit || !activeProjData}>Save snapshot</Button>
                <Button onClick={handleRefresh} disabled={isRefreshing}>{isRefreshing ? 'Reforecasting…' : reforecastLabel}</Button> */}
              {isSavePromptOpen && !atSnapshotLimit && (
                <SaveSnapshotPopover
                  placeholder={`${coinSymbol} forecast`}
                  name={saveName}
                  onNameChange={setSaveName}
                  error={saveError}
                  onConfirm={() => void handleSaveConfirm()}
                  onCancel={closeSavePrompt}
                />
              )}
            </div>
          }
        />
        <ChartNotices
          coinSymbol={coinSymbol}
          isOffBatchCoin={isOffBatchCoin}
          forecastUnavailable={forecastUnavailable}
          forecastAnchorPrice={forecastAnchorPrice}
          isRefreshing={isRefreshing}
          onReforecast={() => void handleRefresh()}
          reforecastError={reforecastError}
          isStale={isChartDataStale}
          lastUpdatedAt={lastUpdatedAt}
          isRetrying={isRetrying}
          onRetry={() => void handleRetry()}
        />
        <ChartStage
          glow={glow}
          rows={chartRows}
          yDomain={chartYDomain}
          todayMs={todayMs}
          livePrice={livePrice}
          badges={badges}
          projData={activeProjData}
        />
        <ForecastContextPanel projData={activeProjData} isStale={isStale} />
      </Card>
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
