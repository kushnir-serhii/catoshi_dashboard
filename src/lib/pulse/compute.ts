/**
 * Market Pulse model (spec 027 technical §2). Pure: no I/O, no clock. The
 * caller passes `now`, the live signal rows for the scope and the collector
 * status rows. The DB loader, the collect step and the tests all run this code.
 *
 * Pipeline, in order:
 *   1. Scope filter. An asset scope keeps that asset's rows plus `market` rows
 *      (asset null). Scope `market` keeps every row; asset rows get
 *      `PULSE_MARKET_ASSET_FACTOR`.
 *   2. Cluster collapse. News rows that share a `clusterId` become one input.
 *      The representative is picked with the same rule as the feed
 *      (`src/lib/news/collapse.ts`: highest stored severity, then newest
 *      `publishedAt`, then highest id), so the driver's `signalId` is the id of
 *      the collapsed card and the chip can scroll to it.
 *   3. Exclusions. A news input with `contentType` null (an older prompt
 *      version) is dropped from the Pulse and from `inputCount`. If the card's
 *      representative is unclassified but another member is classified, the
 *      highest-severity classified member supplies severity, sign and label;
 *      the `signalId` stays the card id. A row whose rule id has no category is
 *      dropped too.
 *   4. Per row: `m = severity · decay · opinionFactor · scopeFactor`.
 *   5. Per category and side, `Σm` is capped at `PULSE_CATEGORY_CAP`, then
 *      multiplied by `W[category]`. Each row's `c` is scaled the same way, so
 *      the drivers' `c` add up to the raw totals.
 *   6. Indices, Conflict, drivers (top `PULSE_DRIVER_COUNT` by |c|), missing
 *      categories and the summary line.
 */

import { MACRO_DECAY_HOURS } from '@/consts/macro';
import { NEWS_MAGNITUDE_SEVERITY } from '@/consts/news';
import {
  PULSE_CATEGORY_CAP,
  PULSE_CATEGORY_COLLECTOR,
  PULSE_CONFLICT_MIN,
  PULSE_DRIVER_COUNT,
  PULSE_K,
  PULSE_MARKET_ASSET_FACTOR,
  PULSE_MIN_INPUTS,
  PULSE_OPINION_WEIGHT,
  PULSE_RULE_CATEGORY,
  PULSE_SEVERITY,
  PULSE_STATE_SEVERITY_BOUNDS,
  PULSE_WEIGHTS,
  type PulseCategory,
} from '@/consts/pulse';
import { TRACKED_COINS } from '@/consts/signals';
import type { NewsSignalItem, PulseDriver, PulseScope } from '@/data/types';
import type { SignalTag } from '@/lib/signals/types';

import { buildPulseSummary } from './summary';

export type PulseAsset = Exclude<PulseScope, 'market'>;
export type PulseSeverityLevel = keyof typeof PULSE_SEVERITY;

const MS_PER_HOUR = 3_600_000;

/** Fields every live `public.signals` row provides to the Pulse. */
interface PulseInputBase {
  /** `public.signals.id`; the driver chip's `signalId`. */
  id: string;
  /** `public.signals.asset_id` as a tracked symbol; null for market-wide rows. */
  asset: PulseAsset | null;
  tag: SignalTag;
  /** Stored `public.signals.severity`. */
  severity: number;
  /** Card title; becomes the driver label. */
  title: string;
  /** Card body; its first measured number becomes the driver display value. */
  body: string;
}

/** Market-state row (`kind = 'market_state'`). Re-asserted hourly: no decay. */
export interface PulseMarketStateInput extends PulseInputBase {
  kind: 'market_state';
  ruleId: string;
}

/** Macro row (`kind = 'macro'`, asset null, rule id `macro_*`). */
export interface PulseMacroInput extends PulseInputBase {
  kind: 'macro';
  ruleId: string;
  /** `since_ts`: the FRED observation date. Drives the decay. */
  observedAt: Date | string;
}

/** News row (`kind = 'news'`), joined to its classification and news item. */
export interface PulseNewsInput extends PulseInputBase {
  kind: 'news';
  /** Classifier magnitude; preferred over the stored number when present. */
  magnitude: PulseSeverityLevel | null;
  horizonHours: number;
  /** Null for classifications written under an older prompt version. */
  contentType: NewsSignalItem['contentType'];
  /** `news_items.cluster_id`; null means the row is its own cluster. */
  clusterId: string | null;
  publishedAt: Date | string;
}

export type PulseInputRow = PulseMarketStateInput | PulseMacroInput | PulseNewsInput;

/** Last outcome per `public.collector_status.source`. */
export interface PulseCollectorStatus {
  source: string;
  ok: boolean;
}

/** A driver as stored in `market_pulse.drivers` (jsonb): the API shape plus `c`. */
export interface PulseDriverRecord extends PulseDriver {
  /** Contribution after the category cap and weight; sign matches `sign`. */
  c: number;
  category: PulseCategory;
}

/** Capped and weighted raw totals of one category. */
export interface PulseCategoryRaw {
  bull: number;
  bear: number;
}

export type PulseComputation =
  | { status: 'insufficient'; inputCount: number }
  | {
      status: 'ok';
      /** 0..100. */
      bull: number;
      /** 0..100. */
      bear: number;
      /** `bull − bear`, −100..+100. */
      value: number;
      conflict: boolean;
      inputCount: number;
      /** `Σ max(c, 0)` before the index curve. */
      bullRaw: number;
      /** `Σ max(−c, 0)` before the index curve. */
      bearRaw: number;
      /** Per category, only those with at least one counted input. */
      categories: Partial<Record<PulseCategory, PulseCategoryRaw>>;
      drivers: PulseDriverRecord[];
      missing: string[];
      summary: string;
    };

/**
 * The one place a stored severity becomes a Pulse severity level.
 * - News: the classifier magnitude when known; otherwise the stored number,
 *   bucketed at the midpoints of `NEWS_MAGNITUDE_SEVERITY` (0.25 / 0.5 / 0.8).
 * - Market-state and macro: the continuous 0..1 value, bucketed with
 *   `PULSE_STATE_SEVERITY_BOUNDS`.
 */
export function toPulseSeverity(row: PulseInputRow): PulseSeverityLevel {
  if (row.kind === 'news') {
    if (row.magnitude) return row.magnitude;
    const highFrom = (NEWS_MAGNITUDE_SEVERITY.MEDIUM + NEWS_MAGNITUDE_SEVERITY.HIGH) / 2;
    const mediumFrom = (NEWS_MAGNITUDE_SEVERITY.LOW + NEWS_MAGNITUDE_SEVERITY.MEDIUM) / 2;
    if (row.severity >= highFrom) return 'HIGH';
    if (row.severity >= mediumFrom) return 'MEDIUM';
    return 'LOW';
  }
  if (row.severity >= PULSE_STATE_SEVERITY_BOUNDS.HIGH) return 'HIGH';
  if (row.severity >= PULSE_STATE_SEVERITY_BOUNDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/** Category from `kind` / `rule_id`; null when the rule id is not mapped. */
export function pulseCategoryOf(row: PulseInputRow): PulseCategory | null {
  if (row.kind === 'news') return 'news';
  return PULSE_RULE_CATEGORY[row.ruleId] ?? null;
}

function hoursBetween(now: Date, then: Date | string): number {
  return Math.max(0, (now.getTime() - new Date(then).getTime()) / MS_PER_HOUR);
}

/** An unparseable timestamp gives decay 0 rather than NaN in every total. */
function expDecay(ageHours: number, scaleHours: number): number {
  if (!Number.isFinite(ageHours) || !(scaleHours > 0)) return 0;
  return Math.exp(-ageHours / scaleHours);
}

function decayOf(row: PulseInputRow, now: Date): number {
  switch (row.kind) {
    case 'market_state':
      return 1;
    case 'news':
      return expDecay(hoursBetween(now, row.publishedAt), row.horizonHours / 2);
    case 'macro':
      return expDecay(hoursBetween(now, row.observedAt), MACRO_DECAY_HOURS);
  }
}

function signOf(tag: SignalTag): 1 | -1 | 0 {
  if (tag === 'BULLISH') return 1;
  if (tag === 'BEARISH') return -1;
  return 0;
}

const MEASURED_NUMBER = /[−-]?\$?\d+(?:[.,]\d+)*(?:\s?(?:%|bps?\b|bn\b|[kKMBT]\b))?/;

/** First measured number in the body (e.g. `−$202M`, `3.27`, `85%`), else the title. */
function displayOf(row: PulseInputRow): string {
  const match = MEASURED_NUMBER.exec(row.body);
  return match ? match[0].trim() : row.title;
}

function inScope(row: PulseInputRow, scope: PulseScope): boolean {
  return scope === 'market' || row.asset === null || row.asset === scope;
}

function timeMs(value: Date | string): number {
  return new Date(value).getTime();
}

/** Feed representative rule, mirrored from `src/lib/news/collapse.ts`. */
function outranks(a: PulseNewsInput, b: PulseNewsInput): boolean {
  if (a.severity !== b.severity) return a.severity > b.severity;
  const at = timeMs(a.publishedAt);
  const bt = timeMs(b.publishedAt);
  if (at !== bt) return at > bt;
  return BigInt(a.id) > BigInt(b.id);
}

/** One counted input: the row that supplies its values, plus the card id. */
interface PulseInput {
  row: PulseInputRow;
  signalId: string;
}

/**
 * One input per cluster. The card id comes from the representative over all
 * members; values come from the best classified member. Clusters with no
 * classified member yield nothing.
 */
function collapseNews(rows: readonly PulseNewsInput[]): PulseInput[] {
  const groups = new Map<string, PulseNewsInput[]>();
  for (const row of rows) {
    const key = row.clusterId ?? `item:${row.id}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const inputs: PulseInput[] = [];
  for (const members of groups.values()) {
    const card = members.reduce((best, row) => (outranks(row, best) ? row : best));
    const classified = members.filter((m) => m.contentType !== null);
    if (classified.length === 0) continue;
    const source =
      card.contentType !== null
        ? card
        : classified.reduce((best, row) => (outranks(row, best) ? row : best));
    inputs.push({ row: source, signalId: card.id });
  }
  return inputs;
}

/**
 * Category labels for `missing` (functional §2.2 "Without: <category>").
 * A category is missing when every collector it depends on fails; a source with
 * no status row is unknown, not failing. Per-asset collectors resolve as
 * `${symbol}:${suffix}` for the scope's assets (scope `market`: all tracked
 * assets). An asset with no row for the category (SOL has no `etfFlows`) is
 * skipped, so `market` flows is missing only when BTC and ETH both fail. A
 * multi-source global category (news) with some sources failing is partial:
 * `news (k/n feeds)`, k = sources still working.
 */
export function missingCategories(
  scope: PulseScope,
  statuses: readonly PulseCollectorStatus[],
): string[] {
  const okBySource = new Map(statuses.map((s) => [s.source, s.ok]));
  const assets: readonly string[] = scope === 'market' ? TRACKED_COINS : [scope];
  const missing: string[] = [];

  for (const [category, collectors] of Object.entries(PULSE_CATEGORY_COLLECTOR) as [
    PulseCategory,
    (typeof PULSE_CATEGORY_COLLECTOR)[PulseCategory],
  ][]) {
    if ('global' in collectors) {
      const known = collectors.global.filter((source) => okBySource.has(source));
      const failing = known.filter((source) => okBySource.get(source) === false).length;
      if (known.length === 0 || failing === 0) continue;
      if (failing === collectors.global.length) {
        missing.push(category);
      } else if (collectors.global.length > 1) {
        const working = collectors.global.length - failing;
        missing.push(`${category} (${working}/${collectors.global.length} feeds)`);
      }
      continue;
    }

    const assetStates = assets
      .map((asset) => collectors.perAsset.map((suffix) => okBySource.get(`${asset}:${suffix}`)))
      .filter((states) => states.some((ok) => ok !== undefined));
    const allFailing =
      assetStates.length > 0 && assetStates.every((states) => states.every((ok) => ok !== true));
    if (allFailing) missing.push(category);
  }
  return missing;
}

/**
 * Computes the Pulse for one scope. `rows` are the live signal rows (the
 * loader's read definition); rows outside the scope are ignored.
 */
export function computePulse(
  scope: PulseScope,
  rows: readonly PulseInputRow[],
  collectorStatuses: readonly PulseCollectorStatus[],
  now: Date,
): PulseComputation {
  const scoped = rows.filter((row) => inScope(row, scope));
  const news = scoped.filter((row): row is PulseNewsInput => row.kind === 'news');
  const inputs: PulseInput[] = [
    ...scoped.filter((row) => row.kind !== 'news').map((row) => ({ row, signalId: row.id })),
    ...collapseNews(news),
  ];

  // Per input: category, sign and the pre-cap magnitude m.
  const counted = inputs.flatMap(({ row, signalId }) => {
    const category = pulseCategoryOf(row);
    if (category === null) return [];
    const opinionFactor =
      row.kind === 'news' && row.contentType === 'opinion' ? PULSE_OPINION_WEIGHT : 1;
    const scopeFactor = scope === 'market' && row.asset !== null ? PULSE_MARKET_ASSET_FACTOR : 1;
    const m =
      PULSE_SEVERITY[toPulseSeverity(row)] * decayOf(row, now) * opinionFactor * scopeFactor;
    return [{ row, signalId, category, sign: signOf(row.tag), m }];
  });

  if (counted.length < PULSE_MIN_INPUTS) {
    return { status: 'insufficient', inputCount: counted.length };
  }

  // Σm per category and side, then the cap factor that brings it to the cap.
  const sums = new Map<string, number>();
  const sideKey = (category: PulseCategory, sign: 1 | -1): string => `${category}:${sign}`;
  for (const input of counted) {
    if (input.sign === 0) continue;
    const key = sideKey(input.category, input.sign);
    sums.set(key, (sums.get(key) ?? 0) + input.m);
  }
  const capFactor = (key: string): number => {
    const sum = sums.get(key) ?? 0;
    return sum > PULSE_CATEGORY_CAP ? PULSE_CATEGORY_CAP / sum : 1;
  };

  let bullRaw = 0;
  let bearRaw = 0;
  const categories: Partial<Record<PulseCategory, PulseCategoryRaw>> = {};
  const contributions: PulseDriverRecord[] = [];
  for (const input of counted) {
    const totals = (categories[input.category] ??= { bull: 0, bear: 0 });
    if (input.sign === 0) continue;
    const c =
      input.sign *
      input.m *
      capFactor(sideKey(input.category, input.sign)) *
      PULSE_WEIGHTS[input.category];
    if (c === 0) continue;
    if (c > 0) {
      bullRaw += c;
      totals.bull += c;
    } else {
      bearRaw -= c;
      totals.bear -= c;
    }
    contributions.push({
      signalId: input.signalId,
      label: input.row.title,
      display: displayOf(input.row),
      sign: input.sign,
      c,
      category: input.category,
    });
  }

  const bull = Math.round(100 * (1 - Math.exp(-bullRaw / PULSE_K)));
  const bear = Math.round(100 * (1 - Math.exp(-bearRaw / PULSE_K)));
  const value = bull - bear;
  const conflict = bull >= PULSE_CONFLICT_MIN && bear >= PULSE_CONFLICT_MIN;
  const drivers = contributions
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, PULSE_DRIVER_COUNT);

  return {
    status: 'ok',
    bull,
    bear,
    value,
    conflict,
    inputCount: counted.length,
    bullRaw,
    bearRaw,
    categories,
    drivers,
    missing: missingCategories(scope, collectorStatuses),
    summary: buildPulseSummary(drivers, value, conflict),
  };
}
