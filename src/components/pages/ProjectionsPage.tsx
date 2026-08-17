'use client';

import { useState, useCallback } from 'react';
import { useDashboard } from '@/components/dashboard/context';
import { ChartPanel, AIPanel, ScenarioPanel, WatchlistPanel, SignalsPanel } from '@/components/panels';
import { aiPredictions, watchlistRows, panelSignals } from '@/data/projections';
import { useProjections } from '@/hooks/useProjections';
import { useForecastSettings } from '@/hooks/useForecastSettings';
import { useForecastSnapshots } from '@/hooks/useForecastSnapshots';
import type { ProjectionData } from '@/data/types';

type CoinTab = 'BTC' | 'ETH' | 'SOL';

export function ProjectionsPage() {
  const { glow } = useDashboard();
  const glowNorm = glow / 100;
  const [selectedCoin, setSelectedCoin] = useState<CoinTab>('BTC');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [snapshotOverride, setSnapshotOverride] = useState<ProjectionData | null>(null);

  const { service, model, setService, setModel } = useForecastSettings();
  const { projections, isLoading, isStale, refresh } = useProjections(service, model);
  const snapshots = useForecastSnapshots();

  const handleLoadSnapshot = useCallback(
    (id: string) => {
      const snap = snapshots.load(id);
      if (snap) {
        setSnapshotOverride(snap.projection);
        // Also switch to the coin the snapshot is for if it's a valid tab
        const coin = snap.coin as CoinTab;
        if (['BTC', 'ETH', 'SOL'].includes(coin)) {
          setSelectedCoin(coin);
        }
      }
      setIsSettingsOpen(false);
    },
    [snapshots],
  );

  return (
    <div className="grid layout-default">
      <ChartPanel
        glow={glowNorm}
        projections={projections}
        selectedCoin={selectedCoin}
        setSelectedCoin={(c) => { setSelectedCoin(c); setSnapshotOverride(null); }}
        isLoading={isLoading}
        isStale={isStale}
        service={service}
        model={model}
        setService={setService}
        setModel={setModel}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        refresh={refresh}
        snapshotOverride={snapshotOverride}
        snapshots={snapshots.snapshots}
        onSaveSnapshot={snapshots.save}
        onLoadSnapshot={handleLoadSnapshot}
        onRenameSnapshot={snapshots.rename}
        onRemoveSnapshot={snapshots.remove}
      />
      <AIPanel glow={glowNorm} preds={aiPredictions} />
      <ScenarioPanel />
      <WatchlistPanel rows={watchlistRows} />
      <SignalsPanel items={panelSignals} />
    </div>
  );
}
