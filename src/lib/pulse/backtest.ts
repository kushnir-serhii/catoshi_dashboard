/**
 * Market Pulse backtest (spec 027 functional §2.8, technical §8.1). Pure: no I/O,
 * no clock. `src/scripts/pulse-backtest.ts` loads the rows once and calls this;
 * Slice 9's `pulse-api.test.ts` asserts the no-look-ahead rule on `selectRowsAsOf`.
 *
 * NO LOOK-AHEAD. Every row a replayed hour H sees must have existed at H:
 *   - Market-state: the rules are re-run over the stored snapshot of each live
 *     hour h; the row is live at H when H − SIGNALS_FRESHNESS_HOURS < h ≤ H (the
 *     same window `queryLiveMarketStateRows` uses), newest per (asset, rule).
 *     `history4h` holds only 4h candles with `closeTime < h` (`closedCandlesAsOf`).
 *   - News: the stored `kind = 'news'` row counts at H when the row was inserted by
 *     then (`signals.created_at ≤ H`), the article was published by then, and the
 *     row had not expired (`H < expires_at`). Its tag, severity and expiry are
 *     written once at insert and never updated (`publishNewsSignals`: on conflict
 *     do nothing). Magnitude, horizon and content type come from the NEWEST
 *     classification created ≤ H. The read path prefers the current prompt version;
 *     versions only ever move forward in time, so "newest created ≤ H" is the
 *     version the read path would have picked at H. Classifications made later
 *     (news-v2/v3 on 2026-10-09) are invisible to earlier hours, which therefore see
 *     news-v1 rows with `content_type` null, and `computePulse` excludes those.
 *   - Macro: the rules re-run at H over readings whose observation day has ENDED by
 *     H (`obs_date + 1 day ≤ H`), stricter than `obs_date ≤ H` because a daily
 *     reading cannot be known before its day closes. FRED's own publication lag
 *     makes even that optimistic; the table is empty today, so it changes nothing.
 */

import { MACRO_RULE_SERIES } from '@/consts/macro';
import {
  PULSE_BACKTEST_MIN_ALERTS,
  PULSE_BACKTEST_P_MAX,
  PULSE_SCOPES,
  type PulseAlertType,
} from '@/consts/pulse';
import { SIGNALS_FRESHNESS_HOURS } from '@/consts/signals';
import type { MarketSnapshot, PulseScope } from '@/data/types';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import { MACRO_RULES } from '@/lib/signals/macro';
import type { MacroReading } from '@/lib/signals/macro/types';
import { RULES } from '@/lib/signals/rules';
import { clamp01 } from '@/lib/signals/severity';
import type { Signal, SignalTag } from '@/lib/signals/types';

import {
  computePulse,
  type PulseAsset,
  type PulseInputRow,
  type PulseMacroInput,
  type PulseMarketStateInput,
  type PulseNewsInput,
} from './compute';
import {
  decideNotifications,
  point24hAgo,
  type PulsePoint,
  pulsePointFromComputation,
  type SentAlert,
} from './notify-decision';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// Replay inputs
// ---------------------------------------------------------------------------

/** One rule firing, re-computed over the stored snapshot of hour `snapshotMs`. */
export interface ReplayMarketStateRow {
  asset: PulseAsset;
  snapshotMs: number;
  signal: Signal;
}

/** One `news_classifications` row of a news signal's item. */
export interface ReplayClassification {
  createdMs: number;
  magnitude: PulseNewsInput['magnitude'];
  horizonHours: number;
  contentType: PulseNewsInput['contentType'];
}

/** One stored `kind = 'news'` signal row with its item and every classification. */
export interface ReplayNewsRow {
  /** `public.signals.id`. */
  id: string;
  asset: PulseAsset | null;
  tag: SignalTag;
  severity: number;
  title: string;
  body: string;
  /** `coalesce(news_items.cluster_id, news_items.id)`, as the live read path. */
  clusterId: string;
  /** `signals.created_at`: when the row came into existence. */
  createdMs: number;
  publishedMs: number;
  expiresMs: number;
  classifications: readonly ReplayClassification[];
}

/** Everything the replay reads, loaded once for the whole window. */
export interface ReplayPool {
  marketState: readonly ReplayMarketStateRow[];
  news: readonly ReplayNewsRow[];
  /** Macro readings per FRED series, any order. */
  macro: Readonly<Record<string, readonly MacroReading[]>>;
}

export interface SelectOptions {
  /** False for the market-state-only variant (functional §2.8). */
  includeNews: boolean;
}

// ---------------------------------------------------------------------------
// Rule replay
// ---------------------------------------------------------------------------

/**
 * The 4h candles a run at `hourMs` could have seen: closed before it
 * (`closeTime < hourMs`, as `loadHistory4h` drops the open candle), the last
 * `limit`. `candles` must be sorted ascending by `openTime`.
 */
export function closedCandlesAsOf(
  candles: readonly OHLCV[],
  hourMs: number,
  limit: number,
): OHLCV[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].closeTime >= hourMs) end -= 1;
  return candles.slice(Math.max(0, end - limit), end);
}

/** Every rule over one snapshot; a throwing rule is reported, never propagated. */
export function runRulesAt(
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null,
  history4h: OHLCV[],
): { signals: Signal[]; failures: string[] } {
  const signals: Signal[] = [];
  const failures: string[] = [];
  for (const { ruleId, run } of RULES) {
    try {
      const signal = run(snapshot, previous, { history4h });
      if (signal) signals.push(signal);
    } catch {
      failures.push(ruleId);
    }
  }
  return { signals, failures };
}

// ---------------------------------------------------------------------------
// Row selection at an hour (no look-ahead)
// ---------------------------------------------------------------------------

/** Live market-state rows at `hourMs`: newest per (asset, rule) inside the freshness window. */
export function marketStateRowsAsOf(
  rows: readonly ReplayMarketStateRow[],
  hourMs: number,
): PulseMarketStateInput[] {
  const from = hourMs - SIGNALS_FRESHNESS_HOURS * MS_PER_HOUR;
  const newest = new Map<string, ReplayMarketStateRow>();
  for (const row of rows) {
    if (row.snapshotMs > hourMs || row.snapshotMs <= from) continue;
    const key = `${row.asset}:${row.signal.ruleId}`;
    const held = newest.get(key);
    if (!held || row.snapshotMs > held.snapshotMs) newest.set(key, row);
  }
  return [...newest.values()].map(({ asset, snapshotMs, signal }) => ({
    kind: 'market_state',
    id: `replay:${asset}:${signal.ruleId}:${snapshotMs}`,
    asset,
    tag: signal.tag,
    severity: clamp01(signal.severity),
    title: signal.title,
    body: signal.body,
    ruleId: signal.ruleId,
  }));
}

/** Newest classification created at or before `hourMs`, or null. */
function classificationAsOf(
  classifications: readonly ReplayClassification[],
  hourMs: number,
): ReplayClassification | null {
  let best: ReplayClassification | null = null;
  for (const c of classifications) {
    if (c.createdMs > hourMs) continue;
    if (!best || c.createdMs > best.createdMs) best = c;
  }
  return best;
}

/** Live news rows at `hourMs`, each with the classification that existed then. */
export function newsRowsAsOf(rows: readonly ReplayNewsRow[], hourMs: number): PulseNewsInput[] {
  const out: PulseNewsInput[] = [];
  for (const row of rows) {
    if (row.createdMs > hourMs || row.publishedMs > hourMs || hourMs >= row.expiresMs) continue;
    const c = classificationAsOf(row.classifications, hourMs);
    if (!c) continue;
    out.push({
      kind: 'news',
      id: row.id,
      asset: row.asset,
      tag: row.tag,
      severity: row.severity,
      title: row.title,
      body: row.body,
      magnitude: c.magnitude,
      horizonHours: c.horizonHours,
      contentType: c.contentType,
      clusterId: row.clusterId,
      publishedAt: new Date(row.publishedMs),
    });
  }
  return out;
}

/** Macro rows at `hourMs`: the rules over readings whose observation day has ended. */
export function macroRowsAsOf(
  readingsBySeries: Readonly<Record<string, readonly MacroReading[]>>,
  hourMs: number,
): PulseMacroInput[] {
  const now = new Date(hourMs);
  const out: PulseMacroInput[] = [];
  for (const { ruleId, run } of MACRO_RULES) {
    const known = (readingsBySeries[MACRO_RULE_SERIES[ruleId]] ?? [])
      .filter((r) => Date.parse(`${r.obsDate}T00:00:00Z`) + MS_PER_DAY <= hourMs)
      .toSorted((a, b) => (a.obsDate < b.obsDate ? 1 : a.obsDate > b.obsDate ? -1 : 0))
      .slice(0, 2);
    let signal: ReturnType<typeof run>;
    try {
      signal = run(known, now);
    } catch {
      continue;
    }
    if (!signal) continue;
    out.push({
      kind: 'macro',
      id: `replay:${ruleId}:${hourMs}`,
      asset: null,
      tag: signal.tag,
      severity: clamp01(signal.severity),
      title: signal.title,
      body: signal.body,
      ruleId,
      observedAt: signal.sinceTs,
    });
  }
  return out;
}

/**
 * The Pulse input rows as they existed at `hourMs` (no look-ahead; see the file
 * header for the per-kind rule). This is the function Slice 9's test pins.
 */
export function selectRowsAsOf(
  pool: ReplayPool,
  hourMs: number,
  options: SelectOptions,
): PulseInputRow[] {
  return [
    ...marketStateRowsAsOf(pool.marketState, hourMs),
    ...macroRowsAsOf(pool.macro, hourMs),
    ...(options.includeNews ? newsRowsAsOf(pool.news, hourMs) : []),
  ];
}

// ---------------------------------------------------------------------------
// Pulse + decision replay
// ---------------------------------------------------------------------------

/** Expected price direction of an alert: bear/bull, or either way (Conflict). */
export type BacktestDirection = 'bear' | 'bull' | 'either';

export interface ReplayAlert {
  scope: PulseScope;
  type: PulseAlertType;
  atMs: number;
  value: number;
  direction: BacktestDirection;
  reason: string;
}

export interface ReplayDiagnostics {
  hours: number;
  /** Mean rows per hour by kind; `newsClassified` = news rows with a content type. */
  meanRowsPerHour: { marketState: number; macro: number; news: number; newsClassified: number };
  /** Hours with at least one news row that has a content type (counts toward the Pulse). */
  hoursWithClassifiedNews: number;
  okPoints: Record<PulseScope, number>;
  insufficientPoints: Record<PulseScope, number>;
}

export interface ReplayResult {
  alerts: ReplayAlert[];
  diagnostics: ReplayDiagnostics;
}

function perScope(): Record<PulseScope, number> {
  return Object.fromEntries(PULSE_SCOPES.map((s) => [s, 0])) as Record<PulseScope, number>;
}

/** Direction every alert of the type expects; null for reversal (per alert). */
const FIXED_DIRECTION: Record<PulseAlertType, BacktestDirection | null> = {
  bear_confluence: 'bear',
  bull_confluence: 'bull',
  conflict: 'either',
  reversal: null,
};

/**
 * Convention for alert types without a stated direction:
 * - confluence: its own side;
 * - Conflict: either way (a ≥ move up or down), base rate either way too;
 * - reversal: the direction the Pulse value moved over 24h (falling = bear).
 */
function directionOf(
  type: PulseAlertType,
  point: PulsePoint,
  history: readonly PulsePoint[],
): BacktestDirection {
  const fixed = FIXED_DIRECTION[type];
  if (fixed !== null) return fixed;
  const before = point24hAgo(history, point);
  return before !== null && point.value < before.value ? 'bear' : 'bull';
}

/**
 * Replays the Pulse hour by hour: rows as of the hour → `computePulse` per scope
 * (empty collector statuses: `missing` affects only the label, never a value or an
 * alert) → `decideNotifications`, whose own decisions are fed back as `sent` with
 * `sentAt` = the point's `computedAt`, exactly as the live notifier records them.
 */
export function replayPulse(
  hoursMs: readonly number[],
  pool: ReplayPool,
  options: SelectOptions,
): ReplayResult {
  const series: PulsePoint[] = [];
  const sent: SentAlert[] = [];
  const alerts: ReplayAlert[] = [];
  const okPoints = perScope();
  const insufficientPoints = perScope();
  const totals = { marketState: 0, macro: 0, news: 0, newsClassified: 0 };
  let hoursWithClassifiedNews = 0;

  const sorted = [...hoursMs].sort((a, b) => a - b);
  for (const hourMs of sorted) {
    const now = new Date(hourMs);
    const rows = selectRowsAsOf(pool, hourMs, options);
    let classified = 0;
    for (const row of rows) {
      if (row.kind === 'market_state') totals.marketState += 1;
      else if (row.kind === 'macro') totals.macro += 1;
      else {
        totals.news += 1;
        if (row.contentType !== null) classified += 1;
      }
    }
    totals.newsClassified += classified;
    if (classified > 0) hoursWithClassifiedNews += 1;

    for (const scope of PULSE_SCOPES) {
      const point = pulsePointFromComputation(scope, now, computePulse(scope, rows, [], now));
      if (point === null) {
        insufficientPoints[scope] += 1;
        continue;
      }
      okPoints[scope] += 1;
      series.push(point);
    }

    for (const decision of decideNotifications(series, sent, now)) {
      sent.push({ scope: decision.scope, type: decision.type, sentAt: now });
      const history = series.filter(
        (p) => p.scope === decision.scope && p.computedAt.getTime() <= hourMs,
      );
      alerts.push({
        scope: decision.scope,
        type: decision.type,
        atMs: hourMs,
        value: decision.point.value,
        direction: directionOf(decision.type, decision.point, history),
        reason: decision.reason,
      });
    }
  }

  const n = Math.max(1, sorted.length);
  return {
    alerts,
    diagnostics: {
      hours: sorted.length,
      meanRowsPerHour: {
        marketState: totals.marketState / n,
        macro: totals.macro / n,
        news: totals.news / n,
        newsClassified: totals.newsClassified / n,
      },
      hoursWithClassifiedNews,
      okPoints,
      insufficientPoints,
    },
  };
}

// ---------------------------------------------------------------------------
// Outcomes and base rates
// ---------------------------------------------------------------------------

export interface PricePoint {
  ms: number;
  price: number;
}

/** A sorted 1h close series with an index by hour. */
export interface PriceSeries {
  points: readonly PricePoint[];
  indexByMs: ReadonlyMap<number, number>;
  lastMs: number;
}

export function buildPriceSeries(points: readonly PricePoint[]): PriceSeries {
  const sorted = [...points].sort((a, b) => a.ms - b.ms);
  return {
    points: sorted,
    indexByMs: new Map(sorted.map((p, i) => [p.ms, i])),
    lastMs: sorted.at(-1)?.ms ?? -Infinity,
  };
}

/** Per-direction result of one hour's outcome window. */
export type HourOutcome =
  | { status: 'unpriced' }
  | { status: 'censored' }
  | { status: 'scored'; bear: boolean; bull: boolean };

/**
 * From the close at `hourMs`: did any close in (hourMs, hourMs + horizon] reach
 * ≥ `movePct` below (bear) or above (bull)? `unpriced` when there is no close at
 * `hourMs`; `censored` when the data ends before the window does (such hours are
 * left out of n and out of the base rate alike).
 */
export function outcomeAt(
  series: PriceSeries,
  hourMs: number,
  horizonHours: number,
  movePct: number,
): HourOutcome {
  const i = series.indexByMs.get(hourMs);
  if (i === undefined) return { status: 'unpriced' };
  const end = hourMs + horizonHours * MS_PER_HOUR;
  if (series.lastMs < end) return { status: 'censored' };
  const base = series.points[i].price;
  const down = base * (1 - movePct / 100);
  const up = base * (1 + movePct / 100);
  let bear = false;
  let bull = false;
  for (let j = i + 1; j < series.points.length && series.points[j].ms <= end; j += 1) {
    const close = series.points[j].price;
    if (close <= down) bear = true;
    if (close >= up) bull = true;
  }
  return { status: 'scored', bear, bull };
}

export function isHit(outcome: { bear: boolean; bull: boolean }, d: BacktestDirection): boolean {
  if (d === 'bear') return outcome.bear;
  if (d === 'bull') return outcome.bull;
  return outcome.bear || outcome.bull;
}

export interface BaseRate {
  /** Hours scored (priced, not censored). */
  n: number;
  censored: number;
  unpriced: number;
  bear: number;
  bull: number;
  either: number;
}

/** Unconditional same-direction base rates over every replayed hour. */
export function baseRateOf(
  series: PriceSeries,
  hoursMs: readonly number[],
  horizonHours: number,
  movePct: number,
): BaseRate {
  const rate: BaseRate = { n: 0, censored: 0, unpriced: 0, bear: 0, bull: 0, either: 0 };
  for (const hourMs of hoursMs) {
    const o = outcomeAt(series, hourMs, horizonHours, movePct);
    if (o.status === 'unpriced') rate.unpriced += 1;
    else if (o.status === 'censored') rate.censored += 1;
    else {
      rate.n += 1;
      if (o.bear) rate.bear += 1;
      if (o.bull) rate.bull += 1;
      if (o.bear || o.bull) rate.either += 1;
    }
  }
  return rate;
}

export function baseRateFor(rate: BaseRate, d: BacktestDirection): number | null {
  if (rate.n === 0) return null;
  return rate[d] / rate.n;
}

/**
 * Keeps an alert only when it is at least `minGapHours` after the last kept one
 * (so outcome windows never overlap). `alerts` must be one (scope, type), sorted.
 */
export function spaceAlerts<T extends { atMs: number }>(
  alerts: readonly T[],
  minGapHours: number,
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let lastMs = -Infinity;
  for (const alert of alerts) {
    if (alert.atMs - lastMs >= minGapHours * MS_PER_HOUR) {
      kept.push(alert);
      lastMs = alert.atMs;
    }
  }
  return { kept, dropped: alerts.length - kept.length };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function logFactorials(n: number): number[] {
  const out = [0];
  for (let i = 1; i <= n; i += 1) out.push(out[i - 1] + Math.log(i));
  return out;
}

/** Exact one-sided binomial tail P(X ≥ k | n, p), summed in log space. */
export function binomialUpperTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lf = logFactorials(n);
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  const terms: number[] = [];
  for (let i = k; i <= n; i += 1) terms.push(lf[n] - lf[i] - lf[n - i] + i * lp + (n - i) * lq);
  const max = Math.max(...terms);
  const sum = terms.reduce((acc, t) => acc + Math.exp(t - max), 0);
  return Math.min(1, Math.exp(max + Math.log(sum)));
}

/**
 * Exact P(X ≥ k) for a sum of independent Bernoullis with probabilities `ps`
 * (Poisson-binomial). Used for reversal, whose alerts mix directions and so
 * have per-alert base rates; equals `binomialUpperTail` when all `ps` are equal.
 */
export function poissonBinomialUpperTail(k: number, ps: readonly number[]): number {
  if (k <= 0) return 1;
  if (k > ps.length) return 0;
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let i = 0; i < dist.length; i += 1) {
      next[i] += dist[i] * (1 - p);
      next[i + 1] += dist[i] * p;
    }
    dist = next;
  }
  return Math.min(
    1,
    dist.slice(k).reduce((a, b) => a + b, 0),
  );
}

export type BacktestVerdict = 'A' | 'B' | 'C';

/** Functional §2.8: B below the minimum n; else A when p < P_MAX, otherwise C. */
export function verdictOf(n: number, pValue: number | null): BacktestVerdict {
  if (n < PULSE_BACKTEST_MIN_ALERTS || pValue === null) return 'B';
  return pValue < PULSE_BACKTEST_P_MAX ? 'A' : 'C';
}

const VERDICT_RANK: Record<BacktestVerdict, number> = { A: 0, B: 1, C: 2 };

/** The most restrictive verdict (C over B over A); B for an empty list. */
export function worstVerdict(verdicts: readonly BacktestVerdict[]): BacktestVerdict {
  return verdicts.reduce<BacktestVerdict>(
    (worst, v) => (VERDICT_RANK[v] > VERDICT_RANK[worst] ? v : worst),
    verdicts.length > 0 ? 'A' : 'B',
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Confluence types decide the verdict; Conflict and reversal are informational. */
export const PRIMARY_ALERT_TYPES: readonly PulseAlertType[] = [
  'bear_confluence',
  'bull_confluence',
];
export const ALL_ALERT_TYPES: readonly PulseAlertType[] = [
  'bear_confluence',
  'bull_confluence',
  'conflict',
  'reversal',
];

export interface ScoredAlert extends ReplayAlert {
  outcome: 'hit' | 'miss' | 'censored' | 'unpriced' | 'spaced_out';
}

export interface BacktestCell {
  scope: PulseScope;
  type: PulseAlertType;
  primary: boolean;
  /** Alerts after the 24h dedupe. */
  decided: number;
  unpriced: number;
  /** Dropped by the ≥ horizon spacing. */
  spacedOut: number;
  censored: number;
  /** Qualifying alerts: spaced, priced, outcome window complete. */
  n: number;
  hits: number;
  falseAlarms: number;
  hitRate: number | null;
  /** Same-direction base rate; for reversal, the mean of the per-alert rates. */
  baseRate: number | null;
  pValue: number | null;
  verdict: BacktestVerdict;
}

export interface ScoreConfig {
  horizonHours: number;
  movePct: number;
}

/** Scores one replay's alerts per (scope, type) against each scope's price series. */
export function scoreAlerts(
  alerts: readonly ReplayAlert[],
  priceByScope: Readonly<Record<PulseScope, PriceSeries>>,
  baseByScope: Readonly<Record<PulseScope, BaseRate>>,
  config: ScoreConfig,
): { cells: BacktestCell[]; scored: ScoredAlert[] } {
  const cells: BacktestCell[] = [];
  const scored: ScoredAlert[] = [];
  for (const scope of PULSE_SCOPES) {
    for (const type of ALL_ALERT_TYPES) {
      const decided = alerts
        .filter((a) => a.scope === scope && a.type === type)
        .sort((a, b) => a.atMs - b.atMs);
      const outcomes = new Map(
        decided.map((a) => [
          a,
          outcomeAt(priceByScope[scope], a.atMs, config.horizonHours, config.movePct),
        ]),
      );
      const priced = decided.filter((a) => outcomes.get(a)!.status !== 'unpriced');
      const { kept, dropped } = spaceAlerts(priced, config.horizonHours);
      const keptSet = new Set(kept);

      let hits = 0;
      let censored = 0;
      const ps: number[] = [];
      for (const alert of decided) {
        const o = outcomes.get(alert)!;
        let outcome: ScoredAlert['outcome'];
        if (o.status === 'unpriced') outcome = 'unpriced';
        else if (!keptSet.has(alert)) outcome = 'spaced_out';
        else if (o.status === 'censored') {
          outcome = 'censored';
          censored += 1;
        } else {
          const hit = isHit(o, alert.direction);
          outcome = hit ? 'hit' : 'miss';
          if (hit) hits += 1;
          ps.push(baseRateFor(baseByScope[scope], alert.direction) ?? 0);
        }
        scored.push({ ...alert, outcome });
      }

      const n = ps.length;
      const fixed = FIXED_DIRECTION[type];
      // Fixed-direction types share one base rate (plain binomial); reversal mixes
      // directions, so each alert carries its own rate (Poisson-binomial).
      const baseRate =
        fixed !== null
          ? baseRateFor(baseByScope[scope], fixed)
          : n > 0
            ? ps.reduce((a, b) => a + b, 0) / n
            : null;
      let pValue: number | null = null;
      if (n > 0) {
        pValue =
          fixed !== null && baseRate !== null
            ? binomialUpperTail(hits, n, baseRate)
            : poissonBinomialUpperTail(hits, ps);
      }
      cells.push({
        scope,
        type,
        primary: PRIMARY_ALERT_TYPES.includes(type),
        decided: decided.length,
        unpriced: decided.length - priced.length,
        spacedOut: dropped,
        censored,
        n,
        hits,
        falseAlarms: n - hits,
        hitRate: n > 0 ? hits / n : null,
        baseRate,
        pValue,
        verdict: verdictOf(n, pValue),
      });
    }
  }
  return { cells, scored };
}
