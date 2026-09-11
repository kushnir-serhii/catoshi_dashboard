'use client';

import { Surface } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { SignInInviteModal } from '@/components/dashboard/SignInInviteModal';
import {
  SCENARIO_DRIFT_MAX,
  SCENARIO_DRIFT_MIN,
  SCENARIO_DRIFT_STEP,
  SCENARIO_HISTORY_DAYS,
  SCENARIO_HORIZON_DEFAULT,
  SCENARIO_HORIZON_MAX,
  SCENARIO_HORIZON_MIN,
  SCENARIO_VOL_MAX,
  SCENARIO_VOL_MIN,
} from '@/consts/scenario';
import type { CoinListItem } from '@/data/types';
import { useHistoricalPrices } from '@/hooks/useHistoricalPrices';
import { usePrices } from '@/hooks/usePrices';
import type { ScenarioOverride } from '@/hooks/useProjectionChart';
import { exhaustedAllowanceMessage } from '@/hooks/useProjections';
import { useSession } from '@/hooks/useSession';
import { computeRealizedStats, projectScenarios } from '@/lib/scenarioStats';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  title?: string;
}

function Slider({ label, value, min, max, step = 1, onChange, format, title }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="scen-row">
      <div className="lbl" title={title}>
        {label}
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--p': pct + '%' } as React.CSSProperties}
      />
      <div className="val mono">{format ? format(value) : value}</div>
    </div>
  );
}

/** Prices span many orders of magnitude across the coin list, so decimals scale
 * with the value rather than being fixed. */
function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const decimals = v >= 100 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 8;
  return (
    '$' +
    v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  );
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

interface ScenarioPanelProps {
  /** Coin driving the simulator — owned by the Projections page so the
   * chart above and this panel always show the same coin. */
  coin: CoinListItem;
  /** Reports the simulator's current effective assumptions whenever they
   * change, so the page can draw them as an overlay line on the chart. */
  onScenarioChange: (override: ScenarioOverride) => void;
  /** Generates a real AI forecast for `coin` — the same action the chart's
   * "Reforecast" button triggers, surfaced here too since this is where the
   * user is actively shaping their own assumptions. */
  onReforecast: () => Promise<void>;
}

export function ScenarioPanel({ coin, onScenarioChange, onReforecast }: ScenarioPanelProps) {
  const [horizon, setHorizon] = useState(SCENARIO_HORIZON_DEFAULT);
  const [vol, setVol] = useState<number | null>(null);
  const [drift, setDrift] = useState<number | null>(null);
  const [isReforecasting, setIsReforecasting] = useState(false);
  const [isSignInInviteOpen, setIsSignInInviteOpen] = useState(false);
  const [reforecastError, setReforecastError] = useState<string | null>(null);
  const { session } = useSession();
  const role = session?.role ?? 'guest';
  const isGuest = role === 'guest';
  const remaining = session?.remaining ?? null;
  const reforecastLabel =
    role === 'user' && remaining !== null ? `Reforecast — ${remaining} left today` : 'Reforecast';

  const { prices, isLoading: isPriceLoading } = usePrices([coin.id]);
  const { data: history, isLoading: isHistoryLoading } = useHistoricalPrices(
    coin.id,
    SCENARIO_HISTORY_DAYS,
  );

  const startPrice = prices?.[coin.id]?.usd;
  const realized = computeRealizedStats(history);

  // σ and drift stay `null` until the user drags them, so they track the
  // selected coin's own measured history — including after switching coins.
  useEffect(() => {
    setVol(null);
    setDrift(null);
  }, [coin.id]);

  const effectiveVol = vol ?? realized.volPct;
  const effectiveDrift = drift ?? realized.driftPct;
  const isCustomised = vol !== null || drift !== null;

  // Report the resolved (nullable-collapsed) assumptions upward on every
  // change so the page can draw them as a live overlay on the chart.
  useEffect(() => {
    onScenarioChange({ volPct: effectiveVol, driftPct: effectiveDrift, horizonDays: horizon });
  }, [effectiveVol, effectiveDrift, horizon, onScenarioChange]);

  const handleReforecast = useCallback(async () => {
    // Guests: the button stays enabled and un-greyed, but pressing it invites
    // sign-in instead of calling the API (spec 022, §2.3). Nothing is fired
    // optimistically after sign-in — the user presses again deliberately.
    if (isGuest) {
      setIsSignInInviteOpen(true);
      return;
    }
    if (role === 'user' && remaining === 0) {
      setReforecastError(exhaustedAllowanceMessage(session?.resetsAt ?? null));
      return;
    }
    setIsReforecasting(true);
    setReforecastError(null);
    try {
      await onReforecast();
    } finally {
      setIsReforecasting(false);
    }
  }, [isGuest, role, remaining, session?.resetsAt, onReforecast]);

  const outcome =
    startPrice !== undefined
      ? projectScenarios(startPrice, horizon, effectiveVol, effectiveDrift)
      : null;

  const changePct = (v: number) =>
    startPrice !== undefined && startPrice > 0 ? ((v - startPrice) / startPrice) * 100 : 0;

  const symbol = coin.symbol.toUpperCase();
  const isLoading = isPriceLoading || isHistoryLoading;

  return (
    <>
      <Surface className="card area-scen">
        <div className="card-header">
          <div className="card-title">
            <span className="marker"></span>Scenario simulator
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button
              className="btn-ghost"
              onClick={() => {
                setVol(null);
                setDrift(null);
              }}
              disabled={!isCustomised}
              style={{ opacity: isCustomised ? 1 : 0.45 }}
              title={`Reset σ and drift to ${symbol}'s realized ${SCENARIO_HISTORY_DAYS}-day history`}
            >
              Reset to history
            </button>
            <button
              className="btn-ghost"
              onClick={() => void handleReforecast()}
              disabled={isReforecasting}
              style={{ opacity: isReforecasting ? 0.6 : 1 }}
              title={`Generate a fresh AI forecast for ${symbol} using these assumptions`}
            >
              {isReforecasting ? 'Reforecasting…' : reforecastLabel}
            </button>
          </div>
        </div>

        {reforecastError && (
          <div className="scen-note" style={{ color: 'var(--red)' }}>
            {reforecastError}
          </div>
        )}

        <div className="scen-coin-row">
          <div className="scen-coin-label">
            <span className="sym">{symbol}</span>
            <span className="name">{coin.name}</span>
          </div>
          <div className="scen-spot">
            <span className="lbl">Spot</span>
            <span className="val tnum">
              {startPrice !== undefined ? fmtUsd(startPrice) : isLoading ? '…' : '—'}
            </span>
          </div>
        </div>

        <Slider
          label="Horizon"
          value={horizon}
          min={SCENARIO_HORIZON_MIN}
          max={SCENARIO_HORIZON_MAX}
          onChange={setHorizon}
          format={(v) => `${v}d`}
          title="How far into the future to project"
        />
        <Slider
          label="Volatility σ"
          value={effectiveVol}
          min={SCENARIO_VOL_MIN}
          max={SCENARIO_VOL_MAX}
          onChange={setVol}
          format={(v) => `${v}%`}
          title="Annualized volatility — how wide the bear/bull band spreads. Seeded from realized history."
        />
        <Slider
          label="Annual drift"
          value={effectiveDrift}
          min={SCENARIO_DRIFT_MIN}
          max={SCENARIO_DRIFT_MAX}
          step={SCENARIO_DRIFT_STEP}
          onChange={setDrift}
          format={(v) => `${v > 0 ? '+' : ''}${v}%`}
          title="Assumed average yearly return. Shifts all three outcomes together. Seeded from realized history."
        />

        <div className="scen-note">
          {realized.isMeasured ? (
            <>
              Seeded from {symbol}&rsquo;s realized {SCENARIO_HISTORY_DAYS}d history — σ{' '}
              {realized.volPct}%, drift {fmtPct(realized.driftPct)}
              {isCustomised ? ' · adjusted' : ''}
            </>
          ) : (
            <>Not enough price history for {symbol} — using generic defaults</>
          )}
        </div>

        <div className="scen-result">
          <div className="cell bear">
            <div className="lbl">Bear · 5%</div>
            <div className="val tnum">{outcome ? fmtUsd(outcome.bear) : '—'}</div>
            {outcome && <div className="chg mono">{fmtPct(changePct(outcome.bear))}</div>}
          </div>
          <div className="cell base">
            <div className="lbl">Base · 50%</div>
            <div className="val tnum glow-text-violet">{outcome ? fmtUsd(outcome.base) : '—'}</div>
            {outcome && <div className="chg mono">{fmtPct(changePct(outcome.base))}</div>}
          </div>
          <div className="cell bull">
            <div className="lbl">Bull · 95%</div>
            <div className="val tnum glow-text-green">{outcome ? fmtUsd(outcome.bull) : '—'}</div>
            {outcome && <div className="chg mono">{fmtPct(changePct(outcome.bull))}</div>}
          </div>
        </div>
      </Surface>
      <SignInInviteModal isOpen={isSignInInviteOpen} onClose={() => setIsSignInInviteOpen(false)} />
    </>
  );
}
