import { SCENARIOS } from '@/consts/scenarios';
import type { ScenarioProbabilities } from '@/data/types';
import { cn } from '@/utils/cn';

interface ScenarioLegendProps {
  probabilities: ScenarioProbabilities | undefined;
}

export function ScenarioLegend({ probabilities }: ScenarioLegendProps) {
  return (
    <div className="text-text-2 mr-auto flex flex-wrap gap-4 text-xs max-sm:basis-full max-sm:gap-x-3 max-sm:gap-y-2">
      {SCENARIOS.map((s) => (
        <span key={s.id} className="whitespace-nowrap">
          <span
            className={cn('mr-2 inline-block size-2.5 rounded-sm align-[-1px]', s.bgClass)}
          ></span>
          {s.name} case
          {probabilities && ` (${probabilities[s.id]}%)`}
        </span>
      ))}
    </div>
  );
}
