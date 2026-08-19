import { Y_DOMAIN_PADDING } from '@/consts/projections';
import type { HistoricalPrice } from '@/data/types';

const MS_PER_DAY = 86_400_000;

/**
 * A single row on the projection chart, keyed by epoch-ms timestamp.
 * Only `hist` is populated by this module today; `bull`/`base`/`bear`
 * are reserved for the forecast scenarios wired up in a later slice.
 */
export interface ChartRow {
  t: number;
  hist?: number;
  bull?: number;
  base?: number;
  bear?: number;
  /** Scenario Simulator's own median (drift-only) projection, overlaid
   * alongside the AI bull/base/bear series so the user can directly compare
   * their manual assumptions against the AI ensemble on the same chart. */
  scenario?: number;
}

/**
 * A single forecast scenario point: `d` days from today, price `p`.
 * Mirrors the shape Slice 4 will land as `ForecastPoint` in
 * `src/data/types.ts` — once that exists, this local type can be replaced
 * by an import with no logic changes.
 */
export interface ScenarioPoint {
  d: number;
  p: number;
}

/**
 * The three anchored forecast scenario series, one array per case, each
 * already rescaled (via `anchorScenario`) to the current live price.
 */
export interface ForecastScenarios {
  bull: ScenarioPoint[];
  base: ScenarioPoint[];
  bear: ScenarioPoint[];
}

/**
 * Returns only the points from `prices` within the most recent `days` days,
 * measured back from the last point's timestamp. `prices` is expected to be
 * sorted ascending by timestamp (as returned by `useHistoricalPrices`).
 */
export function sliceHistory(prices: readonly HistoricalPrice[], days: number): HistoricalPrice[] {
  if (prices.length === 0) return [];

  const lastTimestamp = prices[prices.length - 1].timestamp;
  const cutoff = lastTimestamp - days * MS_PER_DAY;

  return prices.filter((point) => point.timestamp >= cutoff);
}

/**
 * Multiplicatively rescales every point of a forecast scenario so that its
 * day-0 price lines up with the real live price, preserving the scenario's
 * shape (relative growth/decline curve) otherwise. Pure — returns a new
 * array and never mutates `points`.
 */
export function anchorScenario(
  points: readonly ScenarioPoint[],
  aiAnchorPrice: number,
  livePrice: number,
): ScenarioPoint[] {
  const ratio = livePrice / aiAnchorPrice;
  return points.map((point) => ({ d: point.d, p: point.p * ratio }));
}

/**
 * Guards against anchoring a forecast onto a live price that has drifted
 * too far from the AI's anchor price to be meaningful. Per the risk table
 * in technical-considerations.md: a ratio outside (0.5, 2) is unusable.
 * Callers should check this before calling `anchorScenario` and fall back
 * to a history-only chart when it returns `false`.
 */
export function isAnchorRatioSane(aiAnchorPrice: number, livePrice: number): boolean {
  if (!Number.isFinite(aiAnchorPrice) || !Number.isFinite(livePrice)) return false;
  if (aiAnchorPrice <= 0 || livePrice <= 0) return false;

  const ratio = livePrice / aiAnchorPrice;
  return ratio <= 2 && ratio >= 0.5;
}

/**
 * Builds chart rows from a (sliced) history array merged with already
 * anchored forecast scenarios (bull/base/bear), if any. Each scenario
 * point `{d, p}` is placed at `todayMs + d * MS_PER_DAY`. History points
 * and scenario points that land on the same timestamp are merged into a
 * single row rather than duplicated.
 *
 * When `scenarios` and `livePrice` are both present, a single join row is
 * guaranteed to exist at exactly `todayMs`, carrying `hist` (when history
 * data is available) and `bull`/`base`/`bear` all set to `livePrice` — this
 * visually connects the history line to the forecast lines. When
 * `scenarios` is `undefined`, no join row is forced, preserving the
 * history-only behavior from Slice 2.
 *
 * Returned rows are sorted ascending by `t`.
 */
export function buildChartRows(
  history: readonly HistoricalPrice[],
  scenarios: ForecastScenarios | undefined,
  todayMs: number,
  livePrice: number | undefined,
  scenarioOverlay?: readonly ScenarioPoint[],
): ChartRow[] {
  const rowsByTime = new Map<number, ChartRow>();

  const getRow = (t: number): ChartRow => {
    let row = rowsByTime.get(t);
    if (!row) {
      row = { t };
      rowsByTime.set(t, row);
    }
    return row;
  };

  for (const point of history) {
    getRow(point.timestamp).hist = point.price;
  }

  if (scenarios) {
    const scenarioKeys = ['bull', 'base', 'bear'] as const;
    for (const key of scenarioKeys) {
      for (const point of scenarios[key]) {
        const t = todayMs + point.d * MS_PER_DAY;
        getRow(t)[key] = point.p;
      }
    }
  }

  if (scenarioOverlay) {
    for (const point of scenarioOverlay) {
      const t = todayMs + point.d * MS_PER_DAY;
      getRow(t).scenario = point.p;
    }
  }

  if ((scenarios || scenarioOverlay) && livePrice !== undefined) {
    const todayRow = getRow(todayMs);
    if (history.length > 0) {
      todayRow.hist = livePrice;
    }
    if (scenarios) {
      todayRow.bull = livePrice;
      todayRow.base = livePrice;
      todayRow.bear = livePrice;
    }
    if (scenarioOverlay) {
      todayRow.scenario = livePrice;
    }
  }

  return Array.from(rowsByTime.values()).sort((a, b) => a.t - b.t);
}

/**
 * Computes a padded [min, max] y-domain over whatever hist/bull/base/bear
 * values are present across the given rows.
 */
export function computeYDomain(rows: readonly ChartRow[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows) {
    const values = [row.hist, row.bull, row.base, row.bear, row.scenario];
    for (const value of values) {
      if (value === undefined) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 0];
  }

  const padding = (max - min) * Y_DOMAIN_PADDING;
  return [min - padding, max + padding];
}

/**
 * Linearly interpolates the price at `day` between the two bracketing points
 * in `points` (expected sorted ascending by `.d`). Returns the exact point's
 * `p` when `day` lands on it. `points` outside its range are clamped to the
 * nearest endpoint's `p` rather than extrapolated, since scenario curves are
 * only defined for the forecast window they were generated over. Returns
 * `undefined` when `points` is empty.
 */
export function interpolateAt(points: readonly ScenarioPoint[], day: number): number | undefined {
  if (points.length === 0) return undefined;

  const first = points[0];
  const last = points[points.length - 1];
  if (day <= first.d) return first.p;
  if (day >= last.d) return last.p;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (day >= a.d && day <= b.d) {
      if (b.d === a.d) return a.p;
      const t = (day - a.d) / (b.d - a.d);
      return a.p + (b.p - a.p) * t;
    }
  }

  return last.p;
}

/**
 * Adaptive currency formatter for prices spanning small-cap fractions to
 * large whole-dollar values.
 */
export function formatPrice(v: number): string {
  if (v >= 1000) {
    return `$${(v / 1000).toFixed(1)}K`;
  }
  if (v >= 1) {
    return `$${v.toFixed(2)}`;
  }
  if (v === 0) {
    return '$0.00';
  }

  const leadingZeros = Math.max(0, -Math.floor(Math.log10(Math.abs(v))) - 1);
  const decimals = leadingZeros + 4;
  return `$${v.toFixed(decimals)}`;
}
