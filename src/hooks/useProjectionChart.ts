'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  FORECAST_GRID_DAYS,
  HISTORY_FETCH_DAYS,
  RANGE_DAYS,
  type RANGE_OPTIONS,
} from '@/consts/projections';
import type { CoinListItem, ProjectionData } from '@/data/types';
import { useHistoricalPrices } from '@/hooks/useHistoricalPrices';
import { usePrices } from '@/hooks/usePrices';
import type { ChartRow, ForecastScenarios, ScenarioPoint } from '@/lib/projectionSeries';
import {
  anchorScenario,
  buildChartRows,
  clipScenarioToRange,
  computeYDomain,
  interpolateAt,
  isAnchorRatioSane,
  sliceHistory,
} from '@/lib/projectionSeries';
import { projectScenarios } from '@/lib/scenarioStats';

/** The Scenario Simulator's current assumptions, used to draw its own
 * median-projection overlay line on the chart independent of AI coverage. */
export interface ScenarioOverride {
  volPct: number;
  driftPct: number;
  horizonDays: number;
}

export interface UseProjectionChartParams {
  coin: CoinListItem;
  histRange: (typeof RANGE_OPTIONS)[number];
  /** Range applied to the forecast side of the chart — determines how far out
   * (in days) the scenario badges are interpolated. */
  fcastRange: (typeof RANGE_OPTIONS)[number];
  /** Already-fetched projections (e.g. from the caller's own `useProjections`
   * call) — passed in rather than fetched again here to avoid a redundant
   * SWR request for the same data. */
  projections?: ProjectionData[] | null;
  /** Current Scenario Simulator sliders, or `null`/`undefined` to omit the
   * overlay line entirely. */
  scenarioOverride?: ScenarioOverride | null;
}

/** Interpolated end-of-`fcastRange` price for each forecast scenario. `undefined`
 * fields mean no sane-anchored forecast is available to derive a badge from. */
export interface ForecastBadges {
  bull: number | undefined;
  base: number | undefined;
  bear: number | undefined;
}

/** Change in `livePrice` vs. the first history point in the selected `histRange` window. */
export interface HistChange {
  /** Dollar change (`livePrice - firstPointPrice`); can be negative. */
  abs: number;
  /** Percentage change; can be negative. */
  pct: number;
  /** Plain-words caption for the comparison period, e.g. "vs 7 days ago". */
  label: string;
}

export interface UseProjectionChartResult {
  rows: ChartRow[];
  yDomain: [number, number];
  livePrice: number | undefined;
  isLoading: boolean;
  /** The anchor timestamp used to resolve forecast day offsets against —
   * `generatedAt` of the matched projection when one is used, else `Date.now()`. */
  todayMs: number;
  /** Change vs. the first history point in the currently selected `histRange` window. */
  histChange: HistChange;
  /** Interpolated end-of-`fcastRange` prices for the bull/base/bear scenario badges. */
  badges: ForecastBadges;
  /** True when the live price and/or historical price SWR requests most
   * recently failed but stale data is still being shown (`keepPreviousData`). */
  isStale: boolean;
  /** Epoch-ms timestamp of the last successful price/history fetch, or `null`
   * before the first one lands. */
  lastUpdatedAt: number | null;
  /** Revalidates the live price and historical price SWR keys this hook owns.
   * Does not touch the caller's own `useProjections` key — callers that also
   * need to revalidate projections should compose their own retry that calls
   * this plus their `useProjections`'s `refresh`/`mutate`. */
  retry: () => Promise<void>;
}

/**
 * Composes live price + historical price data into chart-ready rows for the
 * projection chart, overlaying anchored bull/base/bear forecast scenarios
 * when a matching, sane-anchored projection is available for `coin`.
 */
export function useProjectionChart({
  coin,
  histRange,
  fcastRange,
  projections,
  scenarioOverride,
}: UseProjectionChartParams): UseProjectionChartResult {
  const coinGeckoId = coin.id;
  const coinSymbol = coin.symbol.toUpperCase();

  const { prices, error: pricesError, mutate: mutatePrices } = usePrices([coinGeckoId]);
  const {
    data: history,
    error: historyError,
    mutate: mutateHistory,
  } = useHistoricalPrices(coinGeckoId, HISTORY_FETCH_DAYS);

  const livePrice = prices?.[coinGeckoId]?.usd;

  const isStale =
    (!!pricesError && livePrice !== undefined) ||
    (!!historyError && !!history && history.length > 0);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  // Also doubles as a stable "now" for the non-forecast `todayMs` fallback below,
  // so re-renders that don't reflect a genuinely new price/history value don't
  // shift `todayMs` and force a full rows/badges rebuild.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (livePrice !== undefined || (history && history.length > 0)) {
      const now = Date.now();
      setLastUpdatedAt(now);
      setNowMs(now);
    }
    // Only re-record when a fresh value actually arrives.
  }, [livePrice, history]);

  async function retry(): Promise<void> {
    await Promise.all([mutatePrices(), mutateHistory()]);
  }

  const projection = useMemo(
    () => projections?.find((p) => p.coin === coinSymbol) ?? null,
    [projections, coinSymbol],
  );

  const useForecast =
    projection !== null &&
    livePrice !== undefined &&
    isAnchorRatioSane(projection.currentPrice, livePrice);

  const todayMs = useForecast ? new Date(projection.generatedAt).getTime() : nowMs;

  const fcastDays = RANGE_DAYS[fcastRange];

  const scenarios: ForecastScenarios | undefined = useMemo(() => {
    if (!useForecast) return undefined;
    const clip = (points: ScenarioPoint[]) =>
      clipScenarioToRange(anchorScenario(points, projection.currentPrice, livePrice), fcastDays);
    return {
      bull: clip(projection.bull),
      base: clip(projection.base),
      bear: clip(projection.bear),
    };
  }, [useForecast, projection, livePrice, fcastDays]);

  const slicedHistory = useMemo(
    () => sliceHistory(history ?? [], RANGE_DAYS[histRange]),
    [history, histRange],
  );

  const scenarioOverlayPoints: ScenarioPoint[] | undefined = useMemo(() => {
    if (!scenarioOverride || livePrice === undefined) return undefined;
    const days = FORECAST_GRID_DAYS.filter((d) => d <= scenarioOverride.horizonDays);
    return days.map((d) => ({
      d,
      p: projectScenarios(livePrice, d, scenarioOverride.volPct, scenarioOverride.driftPct).base,
    }));
  }, [scenarioOverride, livePrice]);

  const rows = useMemo(
    () => buildChartRows(slicedHistory, scenarios, todayMs, livePrice, scenarioOverlayPoints),
    [slicedHistory, scenarios, todayMs, livePrice, scenarioOverlayPoints],
  );

  const yDomain = useMemo(() => computeYDomain(rows), [rows]);

  const histChange = useMemo<HistChange>(() => {
    const firstPointPrice = slicedHistory[0]?.price;
    if (firstPointPrice === undefined || livePrice === undefined || firstPointPrice === 0) {
      return { abs: 0, pct: 0, label: '' };
    }
    const abs = livePrice - firstPointPrice;
    const pct = (abs / firstPointPrice) * 100;
    return {
      abs: Number.isFinite(abs) ? abs : 0,
      pct: Number.isFinite(pct) ? pct : 0,
      label: `vs ${RANGE_DAYS[histRange]} days ago`,
    };
  }, [slicedHistory, livePrice, histRange]);

  const isLoading = (!history || history.length === 0) && livePrice === undefined;

  const badges = useMemo<ForecastBadges>(() => {
    const day = RANGE_DAYS[fcastRange];
    if (!scenarios) return { bull: undefined, base: undefined, bear: undefined };
    return {
      bull: interpolateAt(scenarios.bull, day),
      base: interpolateAt(scenarios.base, day),
      bear: interpolateAt(scenarios.bear, day),
    };
  }, [scenarios, fcastRange]);

  return {
    rows,
    yDomain,
    livePrice,
    isLoading,
    todayMs,
    histChange,
    badges,
    isStale,
    lastUpdatedAt,
    retry,
  };
}
