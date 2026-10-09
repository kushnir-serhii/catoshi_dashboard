import { Input, Muted } from '@/components/ui';
import { TODAY_LEVEL_CHIP_PCTS } from '@/consts/today';
import type { TodayResponse } from '@/data/types';
import { closeBeyondProbability, touchProbability } from '@/lib/todayRange';
import {
  formatChipPct,
  formatLevelInput,
  formatProbability,
  levelFromPct,
  levelSide,
} from '@/lib/todayUi';

import { Chip } from './Chip';
import { ChipGroup } from './ChipGroup';

interface LevelSectionProps {
  data: Extract<TodayResponse, { status: 'ok' }>;
  hoursT: number;
  levelText: string;
  setLevelText: (v: string) => void;
  level: number | null;
}

export function LevelSection({ data, hoursT, levelText, setLevelText, level }: LevelSectionProps) {
  const side = level === null ? null : levelSide(data.spot, level);
  const touch =
    level === null ? null : touchProbability(data.spot, level, data.sigmaHourly, hoursT);
  const beyond =
    level === null ? null : closeBeyondProbability(data.spot, level, data.sigmaHourly, hoursT);
  const atSpot = side === 'at';

  const probabilities =
    level === null || touch === null || beyond === null
      ? null
      : [
          {
            label: 'Touches before horizon end',
            value: formatProbability(touch, { touchAtSpot: atSpot }),
          },
          {
            label: atSpot ? 'Closes beyond it at horizon end' : `Closes ${side} it at horizon end`,
            value: atSpot ? '—' : formatProbability(beyond),
          },
        ];

  return (
    <div className="border-line mt-4 border-t pt-3">
      <label
        className="text-text-2 mb-1 block text-sm leading-(--lh-normal)"
        htmlFor="today-level-input"
      >
        Price level
      </label>
      <Input
        id="today-level-input"
        className="font-mono"
        inputMode="decimal"
        autoComplete="off"
        value={levelText}
        onChange={(e) => setLevelText(e.target.value)}
      />
      <ChipGroup label="Level relative to spot">
        {TODAY_LEVEL_CHIP_PCTS.map((pct) => (
          <Chip
            key={pct}
            onClick={() => setLevelText(formatLevelInput(levelFromPct(data.spot, pct)))}
          >
            {formatChipPct(pct)}
          </Chip>
        ))}
      </ChipGroup>
      {probabilities === null ? (
        <Muted as="p">Enter a price to see the odds.</Muted>
      ) : (
        <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {probabilities.map((p) => (
            <div key={p.label}>
              <dt className="text-text-3 m-0 text-sm leading-(--lh-normal)">{p.label}</dt>
              <dd className="text-text mt-1 font-mono text-lg">{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
