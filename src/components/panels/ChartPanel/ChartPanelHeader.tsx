import { CoinSelect } from '@/components/ui';
import type { CoinListItem, ScenarioProbabilities } from '@/data/types';

import { type ChartRange, RangeControls, type RangeTarget } from './RangeControls';
import { ScenarioLegend } from './ScenarioLegend';

interface ChartPanelHeaderProps {
  selectedCoin: CoinListItem;
  onSelectCoin: (coin: CoinListItem) => void;
  probabilities: ScenarioProbabilities | undefined;
  rangeTarget: RangeTarget;
  onToggleRangeTarget: () => void;
  activeRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}

/** Two stacked rows: coin picker, then scenario legend + range controls. */
export function ChartPanelHeader({
  selectedCoin,
  onSelectCoin,
  probabilities,
  rangeTarget,
  onToggleRangeTarget,
  activeRange,
  onRangeChange,
}: ChartPanelHeaderProps) {
  return (
    <div className="mb-4 flex flex-col items-stretch gap-3 max-sm:mb-3">
      <div className="flex flex-wrap items-center gap-3 max-lg:gap-y-2">
        <div className="mr-auto max-sm:basis-full max-sm:[&_.coin-select-trigger]:w-full max-sm:[&_.coin-select-trigger]:justify-between">
          <CoinSelect value={selectedCoin} onChange={onSelectCoin} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ScenarioLegend probabilities={probabilities} />
        <RangeControls
          target={rangeTarget}
          onToggleTarget={onToggleRangeTarget}
          value={activeRange}
          onChange={onRangeChange}
        />
      </div>
    </div>
  );
}
