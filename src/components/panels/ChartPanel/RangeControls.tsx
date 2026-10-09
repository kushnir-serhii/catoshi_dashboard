import { Button, SegmentedTabs } from '@/components/ui';
import { RANGE_OPTIONS } from '@/consts/projections';

export type ChartRange = (typeof RANGE_OPTIONS)[number];
export type RangeTarget = 'history' | 'forecast';

interface RangeControlsProps {
  target: RangeTarget;
  onToggleTarget: () => void;
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}

export function RangeControls({ target, onToggleTarget, value, onChange }: RangeControlsProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
      <Button
        className="bg-bg-2 hover:bg-bg-2 whitespace-nowrap"
        onClick={onToggleTarget}
        aria-label={`Range applies to ${target}. Click to switch to ${target === 'history' ? 'forecast' : 'history'}.`}
        title="Toggle whether the range buttons apply to the history or forecast range"
      >
        {target === 'history' ? 'History' : 'Forecast'} <span aria-hidden="true">▾</span>
      </Button>
      <SegmentedTabs
        options={RANGE_OPTIONS}
        value={value}
        onChange={onChange}
        className="max-sm:flex-1 max-sm:justify-between max-sm:[&>button]:flex-1"
      />
    </div>
  );
}
