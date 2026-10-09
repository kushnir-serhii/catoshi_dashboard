import type { TodayQuantiles } from '@/lib/todayRange';
import { type BandLayout, formatUsd } from '@/lib/todayUi';

interface RangeBandProps {
  layout: BandLayout;
  q: TodayQuantiles;
}

export function RangeBand({ layout, q }: RangeBandProps) {
  const legend = [
    {
      key: '90',
      swatch: 'border border-violet-2 bg-violet-soft',
      text: `90%: ${formatUsd(q.p05)} to ${formatUsd(q.p95)}`,
    },
    { key: '50', swatch: 'bg-violet-2', text: `50%: ${formatUsd(q.p25)} to ${formatUsd(q.p75)}` },
  ];

  return (
    <div className="mt-4" role="img" aria-label="Expected price range">
      <div className="bg-surface-3 relative h-7 rounded-sm">
        {/* Left/width are computed from the quantiles at runtime. */}
        <div
          className="border-violet-2 bg-violet-soft absolute inset-y-0 rounded-sm border"
          style={{ left: `${layout.p05}%`, width: `${layout.p95 - layout.p05}%` }}
        />
        <div
          className="bg-violet-2 absolute inset-y-0 opacity-75"
          style={{ left: `${layout.p25}%`, width: `${layout.p75 - layout.p25}%` }}
        />
        <div
          className="bg-text absolute -top-1 -bottom-1 w-0.5 -translate-x-px"
          style={{ left: `${layout.spot}%` }}
        />
        {layout.level !== null && (
          <div
            className="bg-text-3 border-text-2 absolute -top-1 -bottom-1 w-0 -translate-x-px border-l border-dashed"
            style={{ left: `${layout.level}%` }}
          />
        )}
      </div>
      <div className="text-text-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-(--lh-normal)">
        {legend.map((item) => (
          <span key={item.key}>
            <i className={`mr-1 inline-block size-2.5 rounded-[2px] ${item.swatch}`} /> {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
