'use client';

import { useCallback, useState } from 'react';

import { useDashboard } from '@/components/dashboard/context';
import { WatchlistManageModal } from '@/components/dashboard/WatchlistManageModal';
import {
  AIPanel,
  ChartPanel,
  ScenarioPanel,
  SignalsPanel,
  WatchlistPanel,
} from '@/components/panels';
import { DEFAULT_COIN } from '@/consts/projections';
import type { CoinListItem, ProjectionData } from '@/data/types';
import { useCoinSearch } from '@/hooks/useCoinSearch';
import { useForecastSettings } from '@/hooks/useForecastSettings';
import { useForecastSnapshots } from '@/hooks/useForecastSnapshots';
import { useMarkets } from '@/hooks/useMarkets';
import type { ScenarioOverride } from '@/hooks/useProjectionChart';
import { useProjections } from '@/hooks/useProjections';
import { useSignals } from '@/hooks/useSignals';
import { useWatchlist } from '@/hooks/useWatchlist';

export function ProjectionsPage() {
  const { glow } = useDashboard();
  const glowNorm = glow / 100;
  const [selectedCoin, setSelectedCoin] = useState<CoinListItem>(DEFAULT_COIN);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [snapshotOverride, setSnapshotOverride] = useState<ProjectionData | null>(null);
  const [scenarioOverride, setScenarioOverride] = useState<ScenarioOverride | null>(null);
  const [isWatchlistManageOpen, setIsWatchlistManageOpen] = useState(false);

  const { service, model, setServiceAndModel } = useForecastSettings();
  const { projections, isLoading, isStale, refresh, refreshCoin } = useProjections(service, model);
  const snapshots = useForecastSnapshots();
  const { search: searchCoins } = useCoinSearch();
  const { assets: popularAssets } = useMarkets();

  // The panel showed four hardcoded mock signals ("Whale accumulation up 14%
  // w/w") next to live prices. It now reads the same store the Signals page
  // does — SWR dedupes the request between the two.
  const {
    signals: liveSignals,
    isLoading: signalsLoading,
    fetchError: signalsFetchError,
  } = useSignals();

  const watchlist = useWatchlist();
  const {
    assets: watchlistAssets,
    isLoading: watchlistLoading,
    isStale: watchlistStale,
    countdown: watchlistCountdown,
  } = useMarkets(watchlist.ids);

  const handleLoadSnapshot = useCallback(
    (id: string) => {
      const snap = snapshots.load(id);
      if (snap) {
        setSnapshotOverride(snap.projection);
        // Best-effort: resolve the snapshot's coin symbol back to a full
        // CoinListItem (id/name) via the already-loaded coin list, so the
        // rest of the page can switch to it. If the list hasn't loaded yet
        // or there's no match, the current selection is left alone.
        const match = searchCoins(snap.coin).find(
          (c) => c.symbol.toUpperCase() === snap.coin.toUpperCase(),
        );
        if (match) setSelectedCoin(match);
      }
      setIsSettingsOpen(false);
    },
    [snapshots, searchCoins],
  );

  const handleReforecast = useCallback(async () => {
    await refreshCoin(selectedCoin, service, model);
  }, [refreshCoin, selectedCoin, service, model]);

  return (
    <div className="layout-default grid">
      <h1 className="sr-only">Projections</h1>
      <ChartPanel
        glow={glowNorm}
        projections={projections}
        selectedCoin={selectedCoin}
        setSelectedCoin={(c) => {
          setSelectedCoin(c);
          setSnapshotOverride(null);
        }}
        isLoading={isLoading}
        isStale={isStale}
        service={service}
        model={model}
        setServiceAndModel={setServiceAndModel}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        refresh={refresh}
        onReforecast={handleReforecast}
        scenarioOverride={scenarioOverride}
        snapshotOverride={snapshotOverride}
        snapshots={snapshots.snapshots}
        onSaveSnapshot={snapshots.save}
        onLoadSnapshot={handleLoadSnapshot}
        onRenameSnapshot={snapshots.rename}
        onRemoveSnapshot={snapshots.remove}
      />
      <AIPanel
        glow={glowNorm}
        popularAssets={popularAssets}
        projections={projections}
        selectedCoin={selectedCoin}
        onSelectCoin={setSelectedCoin}
      />
      <ScenarioPanel
        coin={selectedCoin}
        onScenarioChange={setScenarioOverride}
        onReforecast={handleReforecast}
      />
      <WatchlistPanel
        coins={watchlist.coins}
        assets={watchlistAssets}
        projections={projections}
        isLoading={watchlistLoading}
        isStale={watchlistStale}
        countdown={watchlistCountdown}
        onManage={() => setIsWatchlistManageOpen(true)}
      />
      <SignalsPanel items={liveSignals} isLoading={signalsLoading} fetchError={signalsFetchError} />
      <WatchlistManageModal
        isOpen={isWatchlistManageOpen}
        onClose={() => setIsWatchlistManageOpen(false)}
        coins={watchlist.coins}
        add={watchlist.add}
        remove={watchlist.remove}
        isFull={watchlist.isFull}
      />
    </div>
  );
}
