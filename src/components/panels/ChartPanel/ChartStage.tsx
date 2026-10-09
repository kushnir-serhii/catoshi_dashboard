import { ProjectionChart } from '@/components/dashboard/charts';
import { SCENARIOS } from '@/consts/scenarios';
import type { ProjectionData } from '@/data/types';
import type { ForecastBadges, UseProjectionChartResult } from '@/hooks/useProjectionChart';

import { DraggableTag } from './DraggableTag';
import { formatBadgeValue } from './utils';

interface ChartStageProps {
  glow: number;
  rows: UseProjectionChartResult['rows'];
  yDomain: UseProjectionChartResult['yDomain'];
  todayMs: number;
  livePrice: number | undefined;
  badges: ForecastBadges;
  projData: ProjectionData | null;
}

export function ChartStage({
  glow,
  rows,
  yDomain,
  todayMs,
  livePrice,
  badges,
  projData,
}: ChartStageProps) {
  const probabilities = projData?.scenarioProbabilities;

  return (
    <div className="relative">
      <div className="relative h-80 rounded bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent)] max-sm:h-45 max-sm:overflow-hidden">
        <ProjectionChart glow={glow} rows={rows} yDomain={yDomain} todayMs={todayMs} />
      </div>
      {/* The three scenario values. Absolutely positioned over the chart on a
        wide screen; below ~640px the chart is only 180px tall, so they reflow
        into a row under the chart instead of being hidden. */}
      <div className="pointer-events-none absolute top-4.5 right-14 flex flex-col gap-23.5 max-sm:pointer-events-auto max-sm:static max-sm:mt-3 max-sm:flex-row max-sm:flex-wrap max-sm:gap-2">
        {SCENARIOS.map((s) => (
          <DraggableTag
            key={s.id}
            id={s.id}
            label={`${s.name} · ${formatBadgeValue(badges[s.id], livePrice)}${
              probabilities ? ` · ${probabilities[s.id]}% likely` : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}
