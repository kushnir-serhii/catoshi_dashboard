import type { ForecastTarget } from '@/consts/projections';
import type { ForecastPoint } from '@/data/types';
import type { MarketData } from '@/lib/marketData';

/**
 * Real price context for the forecast prompt, plus the guard that keeps a
 * model's answer on the same price scale as the real market.
 *
 * Why this module exists: `buildPrompt` in both providers used to pass only
 * the *number of* historical data points ("BTC 90-day data points: 90
 * entries") and then ask the model to "set currentPrice to the last known
 * price from historical data or your best estimate". No price ever reached
 * the model, so `currentPrice` and the whole scenario curve came out of the
 * model's training data — e.g. a ~$45K BTC against a live ~$81K. The chart
 * then dropped the forecast entirely, because `isAnchorRatioSane`
 * (src/lib/projectionSeries.ts) refuses to anchor a scenario whose
 * live/anchor ratio falls outside (0.5, 2) — which is why the bull/base/bear
 * lines disappeared and the scenario badges showed "—".
 */

/** Number of most recent daily closes quoted verbatim in the prompt. */
const RECENT_CLOSES = 14;

/**
 * Maximum relative gap between the model's stated `currentPrice` and the real
 * last close that is left untouched. Anything larger means the model answered
 * on the wrong price scale, and the projection is rebased onto the real price
 * (see `rebaseToMarketPrice`).
 */
export const ANCHOR_REBASE_TOLERANCE = 0.02;

/** Adaptive USD formatter — 2 decimals for normal prices, more for sub-$1 coins. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${value.toPrecision(6)}`;
}

/**
 * The most recent daily close for `coinId`, or `undefined` when the history
 * fetch returned nothing usable (CoinGecko failure, rate limit, unknown id).
 */
export function lastKnownPrice(marketData: MarketData, coinId: string): number | undefined {
  const series = marketData.historicalPrices[coinId];
  if (!Array.isArray(series) || series.length === 0) return undefined;
  const last = series[series.length - 1];
  return Number.isFinite(last) && last > 0 ? last : undefined;
}

/** Percent change of the last point vs. the point `daysBack` entries earlier. */
function changePct(series: readonly number[], daysBack: number): string {
  if (series.length <= daysBack) return 'n/a';
  const then = series[series.length - 1 - daysBack];
  const now = series[series.length - 1];
  if (!Number.isFinite(then) || then === 0) return 'n/a';
  const pct = ((now - then) / then) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Renders the "Historical Price Context" prompt block from the real 90-day
 * daily closes already fetched by `fetchMarketData` — last price, 7/30/90-day
 * change, 90-day range, and the most recent closes verbatim. Targets whose
 * history could not be fetched are still listed, explicitly flagged as
 * unavailable rather than silently dropped.
 */
export function buildPriceContext(
  marketData: MarketData,
  targets: readonly ForecastTarget[],
): string {
  return targets
    .map((target) => {
      const series = marketData.historicalPrices[target.id] ?? [];
      const last = lastKnownPrice(marketData, target.id);
      if (last === undefined) {
        return `- ${target.name} (${target.symbol}): price history unavailable — do NOT guess a price level for this coin from memory; omit it from the projections array.`;
      }

      const min = Math.min(...series);
      const max = Math.max(...series);
      const recent = series
        .slice(-RECENT_CLOSES)
        .map((p) => formatUsd(p))
        .join(', ');

      return [
        `- ${target.name} (${target.symbol}) CURRENT PRICE: ${formatUsd(last)} (latest daily close, USD).`,
        `  Change: 7d ${changePct(series, 7)} · 30d ${changePct(series, 30)} · 90d ${changePct(series, 89)}.`,
        `  90-day range: ${formatUsd(min)} – ${formatUsd(max)} over ${series.length} daily closes.`,
        `  Last ${Math.min(RECENT_CLOSES, series.length)} daily closes (oldest → newest): ${recent}.`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * The price-scale instruction that goes with `buildPriceContext`. Kept next to
 * it so the two can never drift apart, and shared by both providers so the
 * Claude and OpenAI prompts stay comparable for prompt-version scoring.
 */
export const PRICE_ANCHOR_INSTRUCTION = [
  'Set currentPrice to EXACTLY the CURRENT PRICE given for that coin above — never to a price you remember from training data.',
  'Every {d,p} point in every scenario must be an absolute USD price on that same scale: day 1 of every scenario must be within a few percent of that current price, and the scenarios must diverge from it over time rather than starting somewhere else.',
].join('\n- ');

/** The bull/base/bear curves plus the day-0 anchor they were drawn around. */
export interface RebasableProjection {
  currentPrice: number;
  bull: ForecastPoint[];
  base: ForecastPoint[];
  bear: ForecastPoint[];
}

function scalePoints(points: readonly ForecastPoint[], ratio: number): ForecastPoint[] {
  return points.map((point) => ({ d: point.d, p: Math.round(point.p * ratio * 100) / 100 }));
}

/**
 * Safety net for the failure this module documents: if the model still answers
 * on the wrong price scale, multiplicatively rescale its whole projection —
 * anchor and all three curves — onto the real market price. The scenario shape
 * (its relative trajectory, which is the actual forecast) is preserved exactly;
 * only the level moves. Returns the projection untouched when there is no real
 * price to rebase onto, when either price is unusable, or when the gap is
 * within `ANCHOR_REBASE_TOLERANCE`.
 */
export function rebaseToMarketPrice<T extends RebasableProjection>(
  projection: T,
  marketPrice: number | undefined,
): T {
  if (marketPrice === undefined || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return projection;
  }
  const modelPrice = projection.currentPrice;
  if (!Number.isFinite(modelPrice) || modelPrice <= 0) {
    // No usable anchor of its own — adopt the real price without rescaling,
    // since there is no meaningful ratio to rescale the curves by.
    return { ...projection, currentPrice: marketPrice };
  }

  const ratio = marketPrice / modelPrice;
  if (Math.abs(ratio - 1) <= ANCHOR_REBASE_TOLERANCE) return projection;

  return {
    ...projection,
    currentPrice: marketPrice,
    bull: scalePoints(projection.bull, ratio),
    base: scalePoints(projection.base, ratio),
    bear: scalePoints(projection.bear, ratio),
  };
}
