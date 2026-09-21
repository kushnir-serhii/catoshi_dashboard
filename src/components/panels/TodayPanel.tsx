'use client';

import { Surface } from '@heroui/react';
import { useEffect, useState } from 'react';

import {
  TODAY_CLOCK_TICK_MS,
  TODAY_GATE_VERDICT,
  TODAY_LEVEL_CHIP_PCTS,
  TODAY_LEVEL_DEFAULT_PCT,
} from '@/consts/today';
import type { CoinListItem, TodayResponse } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { resolveTodayGate } from '@/lib/todayGate';
import {
  closeBeyondProbability,
  hoursUntilLocalMidnight,
  quantiles,
  touchProbability,
} from '@/lib/todayRange';
import {
  bandLayout,
  formatAge,
  formatChipPct,
  formatLevelInput,
  formatProbability,
  formatTimeLeft,
  formatTrackLine,
  formatUsd,
  isTodayTracked,
  levelFromPct,
  levelSide,
  parseLevel,
  resolveHorizon,
  type TodayHorizon,
} from '@/lib/todayUi';

interface TodayPanelProps {
  coin: CoinListItem;
}

/** Re-reads the clock on an interval so "updated Ns ago" and the time left stay current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TODAY_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

const PREVIEW_ENABLED = process.env.NEXT_PUBLIC_TODAY_GATE_PREVIEW === 'true';

export function TodayPanel({ coin }: TodayPanelProps) {
  const gate = resolveTodayGate({
    verdict: TODAY_GATE_VERDICT,
    preview: PREVIEW_ENABLED,
    isProduction: process.env.NODE_ENV === 'production',
  });
  if (gate.mode === 'hidden') return null;

  // `key` resets the horizon and level state whenever the coin changes.
  return (
    <TodayCard
      key={coin.id}
      coin={coin}
      showLevel={gate.mode === 'full'}
      isPreview={gate.isPreview}
    />
  );
}

interface TodayCardProps {
  coin: CoinListItem;
  showLevel: boolean;
  isPreview: boolean;
}

function TodayCard({ coin, showLevel, isPreview }: TodayCardProps) {
  const tracked = isTodayTracked(coin.id);
  const { data, error, isLoading } = useToday(tracked ? coin.id : null);
  const now = useNow();

  return (
    <Surface
      className="card area-today today-card"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className="card-header">
        <div className="card-title">
          <span className="marker"></span>Today · {coin.symbol.toUpperCase()}
        </div>
        {isPreview && (
          <span className="today-preview-badge">Uncalibrated preview — not a verdict</span>
        )}
      </div>
      {!tracked ? (
        <p className="muted small">Today range is available for BTC, ETH and SOL.</p>
      ) : isLoading ? (
        <div
          className="today-skeleton animate-pulse"
          aria-busy="true"
          aria-label="Loading today range"
        />
      ) : error || data === null ? (
        <p className="muted small">Intraday data unavailable right now.</p>
      ) : data.status === 'unavailable' ? (
        <UnavailableMessage data={data} />
      ) : (
        <OkBody data={data} now={now} showLevel={showLevel} />
      )}
      <p className="today-footer muted">
        Model estimate from recent volatility. Not a direction call. Not financial advice.
      </p>
    </Surface>
  );
}

function UnavailableMessage({ data }: { data: Extract<TodayResponse, { status: 'unavailable' }> }) {
  // No number is ever rendered here (functional §2.5); `lastBarTs` is a time only.
  if (data.reason === 'insufficient') {
    return <p className="muted small">Not enough recent data.</p>;
  }
  if (data.reason === 'untracked') {
    return <p className="muted small">Today range is available for BTC, ETH and SOL.</p>;
  }
  const last = data.lastBarTs ? new Date(data.lastBarTs) : null;
  const lastText =
    last && !Number.isNaN(last.getTime())
      ? last.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
        })
      : null;
  return (
    <div>
      <p className="muted small">Intraday data unavailable right now.</p>
      {data.reason === 'stale' && lastText && <p className="muted small">last data: {lastText}</p>}
    </div>
  );
}

interface OkBodyProps {
  data: Extract<TodayResponse, { status: 'ok' }>;
  now: number;
  showLevel: boolean;
}

function OkBody({ data, now, showLevel }: OkBodyProps) {
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

  return (
    <>
      <div className="today-head">
        <span className="today-spot mono">{formatUsd(data.spot)}</span>
        <span className="muted small">updated {formatAge(ageMs)}</span>
      </div>
      {/* Server high/low are for the UTC day (not the viewer's local day), labelled as such. */}
      <p className="muted small today-hilo">
        UTC day so far: high {formatUsd(data.dayHighUtc)} · low {formatUsd(data.dayLowUtc)}
      </p>

      <div className="today-chips" role="group" aria-label="Horizon">
        <button
          type="button"
          className={horizon === 'rest' ? 'active' : ''}
          aria-pressed={horizon === 'rest'}
          disabled={restDisabled}
          onClick={() => setSelected('rest')}
        >
          Rest of day
        </button>
        <button
          type="button"
          className={horizon === '24h' ? 'active' : ''}
          aria-pressed={horizon === '24h'}
          onClick={() => setSelected('24h')}
        >
          Next 24h
        </button>
      </div>
      <p className="muted small today-horizon-note">
        {horizon === 'rest'
          ? `until midnight · ${formatTimeLeft(hoursLeft)} left`
          : restDisabled
            ? 'Less than 1h left today, showing the rolling 24 hours.'
            : 'rolling 24 hours'}
      </p>

      <div className="today-band" role="img" aria-label="Expected price range">
        <div className="today-band-track">
          <div
            className="today-band-90"
            style={{ left: `${layout.p05}%`, width: `${layout.p95 - layout.p05}%` }}
          />
          <div
            className="today-band-50"
            style={{ left: `${layout.p25}%`, width: `${layout.p75 - layout.p25}%` }}
          />
          <div className="today-band-spot" style={{ left: `${layout.spot}%` }} />
          {layout.level !== null && (
            <div className="today-band-level" style={{ left: `${layout.level}%` }} />
          )}
        </div>
        <div className="today-band-legend small">
          <span>
            <i className="sw sw-90" /> 90%: {formatUsd(q.p05)} to {formatUsd(q.p95)}
          </span>
          <span>
            <i className="sw sw-50" /> 50%: {formatUsd(q.p25)} to {formatUsd(q.p75)}
          </span>
        </div>
      </div>
      <p className="muted small">
        90% of the time, price at the end of the period lands in this range.
      </p>

      {showLevel && (
        <LevelSection
          data={data}
          hoursT={hoursT}
          levelText={levelText ?? ''}
          setLevelText={setLevelText}
          level={level}
        />
      )}

      {trackLine && <p className="muted small today-track">{trackLine}</p>}
    </>
  );
}

interface LevelSectionProps {
  data: Extract<TodayResponse, { status: 'ok' }>;
  hoursT: number;
  levelText: string;
  setLevelText: (v: string) => void;
  level: number | null;
}

function LevelSection({ data, hoursT, levelText, setLevelText, level }: LevelSectionProps) {
  const side = level === null ? null : levelSide(data.spot, level);
  const touch =
    level === null ? null : touchProbability(data.spot, level, data.sigmaHourly, hoursT);
  const beyond =
    level === null ? null : closeBeyondProbability(data.spot, level, data.sigmaHourly, hoursT);
  const atSpot = side === 'at';

  return (
    <div className="today-level">
      <label className="today-level-label small" htmlFor="today-level-input">
        Price level
      </label>
      <input
        id="today-level-input"
        className="today-level-input mono"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={levelText}
        onChange={(e) => setLevelText(e.target.value)}
      />
      <div
        className="today-chips today-level-chips"
        role="group"
        aria-label="Level relative to spot"
      >
        {TODAY_LEVEL_CHIP_PCTS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setLevelText(formatLevelInput(levelFromPct(data.spot, pct)))}
          >
            {formatChipPct(pct)}
          </button>
        ))}
      </div>
      {level === null || touch === null || beyond === null ? (
        <p className="muted small">Enter a price to see the odds.</p>
      ) : (
        <dl className="today-probs">
          <div>
            <dt className="small muted">Touches before horizon end</dt>
            <dd className="mono">{formatProbability(touch, { touchAtSpot: atSpot })}</dd>
          </div>
          <div>
            <dt className="small muted">
              {atSpot ? 'Closes beyond it at horizon end' : `Closes ${side} it at horizon end`}
            </dt>
            <dd className="mono">{atSpot ? '—' : formatProbability(beyond)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
