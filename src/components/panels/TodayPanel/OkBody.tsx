import { useState } from 'react';

import { Muted } from '@/components/ui';
import { TODAY_LEVEL_DEFAULT_PCT } from '@/consts/today';
import type { TodayResponse } from '@/data/types';
import { hoursUntilLocalMidnight, quantiles } from '@/lib/todayRange';
import {
  bandLayout,
  formatAge,
  formatLevelInput,
  formatTimeLeft,
  formatTrackLine,
  formatUsd,
  levelFromPct,
  parseLevel,
  resolveHorizon,
  type TodayHorizon,
} from '@/lib/todayUi';

import { Chip } from './Chip';
import { ChipGroup } from './ChipGroup';
import { LevelSection } from './LevelSection';
import { RangeBand } from './RangeBand';

interface OkBodyProps {
  data: Extract<TodayResponse, { status: 'ok' }>;
  now: number;
  showLevel: boolean;
}

export function OkBody({ data, now, showLevel }: OkBodyProps) {
  const [selected, setSelected] = useState<TodayHorizon>('rest');
  // null = untouched: filled with spot +1% once (state set during render, not on every poll).
  const [levelText, setLevelText] = useState<string | null>(null);
  if (levelText === null) {
    setLevelText(formatLevelInput(levelFromPct(data.spot, TODAY_LEVEL_DEFAULT_PCT)));
  }

  const hoursLeft = hoursUntilLocalMidnight(new Date(now));
  const { horizon, hoursT, restDisabled } = resolveHorizon(selected, hoursLeft);

  const q = quantiles(data.spot, data.sigmaHourly, hoursT);
  const level = showLevel && levelText !== null ? parseLevel(levelText) : null;
  const layout = bandLayout(q, data.spot, level);
  const trackLine = formatTrackLine(data.track);

  const ageMs = now - new Date(data.spotTs).getTime();

  const horizons: { value: TodayHorizon; label: string; disabled?: boolean }[] = [
    { value: 'rest', label: 'Rest of day', disabled: restDisabled },
    { value: '24h', label: 'Next 24h' },
  ];

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-text font-mono text-lg">{formatUsd(data.spot)}</span>
        <Muted>updated {formatAge(ageMs)}</Muted>
      </div>
      {/* Server high/low are for the UTC day (not the viewer's local day), labelled as such. */}
      <Muted as="p" className="mt-1">
        UTC day so far: high {formatUsd(data.dayHighUtc)} · low {formatUsd(data.dayLowUtc)}
      </Muted>

      <ChipGroup label="Horizon">
        {horizons.map((h) => (
          <Chip
            key={h.value}
            active={horizon === h.value}
            aria-pressed={horizon === h.value}
            disabled={h.disabled}
            onClick={() => setSelected(h.value)}
          >
            {h.label}
          </Chip>
        ))}
      </ChipGroup>
      <Muted as="p" className="mt-1">
        {horizon === 'rest'
          ? `until midnight · ${formatTimeLeft(hoursLeft)} left`
          : restDisabled
            ? 'Less than 1h left today, showing the rolling 24 hours.'
            : 'rolling 24 hours'}
      </Muted>

      <RangeBand layout={layout} q={q} />
      <Muted as="p">90% of the time, price at the end of the period lands in this range.</Muted>

      {showLevel && (
        <LevelSection
          data={data}
          hoursT={hoursT}
          levelText={levelText ?? ''}
          setLevelText={setLevelText}
          level={level}
        />
      )}

      {trackLine && (
        <Muted as="p" className="mt-3">
          {trackLine}
        </Muted>
      )}
    </>
  );
}
