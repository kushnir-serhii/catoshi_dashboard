/**
 * Notification decisions for the Market Pulse (spec 027 functional §2.7,
 * technical §8). Pure and deterministic: no I/O, no clock. Shared by the
 * backtest (§8.1), which replays it hour by hour and feeds its own decisions
 * back in as `sent`, and the live notifier, which passes the rows of
 * `pulse_notifications`. Both get the same dedupe because both describe a sent
 * alert by the time of the Pulse point that triggered it (see `SentAlert`).
 */

import {
  PULSE_ALERT_BEAR_MIN,
  PULSE_ALERT_BULL_MIN,
  PULSE_ALERT_CATEGORY_MIN_C,
  PULSE_ALERT_DEDUPE_HOURS,
  PULSE_ALERT_MIN_CATEGORIES,
  PULSE_ALERT_PREV_MAX_GAP_HOURS,
  PULSE_PREV24H_TOLERANCE_HOURS,
  PULSE_REVERSAL_POINTS,
  PULSE_SCOPES,
  type PulseAlertType,
  type PulseCategory,
} from '@/consts/pulse';
import type { PulseScope } from '@/data/types';
import type { PulseRow } from '@/lib/db/pulse';

import type { PulseCategoryRaw, PulseComputation } from './compute';

const MS_PER_HOUR = 3_600_000;

/** Output order within a scope. */
const ALERT_TYPE_ORDER: readonly PulseAlertType[] = [
  'bear_confluence',
  'bull_confluence',
  'conflict',
  'reversal',
];

/** A driver as a message needs it; built from a computed or a stored driver. */
export interface PulsePointDriver {
  signalId: string;
  label: string;
  display: string;
  /** Signed contribution: > 0 bullish, < 0 bearish. */
  c: number;
}

/**
 * One Pulse value of one scope at one time.
 *
 * `bearCategories` / `bullCategories` are only known when the point comes from
 * a fresh `computePulse` result (`categories` is not stored in `market_pulse`,
 * and stored drivers carry no category and are only the top 5). They are null
 * for points rebuilt from stored rows. Only the current point needs them
 * (confluence); history points serve reversal and Conflict entry, which use
 * `value` and `conflict` only.
 */
export interface PulsePoint {
  scope: PulseScope;
  computedAt: Date;
  bull: number;
  bear: number;
  value: number;
  conflict: boolean;
  /** Distinct categories with bear total ≥ `PULSE_ALERT_CATEGORY_MIN_C`; null = unknown. */
  bearCategories: number | null;
  /** Distinct categories with bull total ≥ `PULSE_ALERT_CATEGORY_MIN_C`; null = unknown. */
  bullCategories: number | null;
  drivers: readonly PulsePointDriver[];
}

/**
 * An alert already decided for (scope, type). `sentAt` is the `computedAt` of
 * the point that triggered it, not the wall-clock send time: the backtest has
 * no send time, and the live notifier gets it by joining
 * `pulse_notifications.pulse_id` to `market_pulse.computed_at`. Using the
 * wall-clock `sent_at` instead would push the next allowed alert one hourly
 * run later than in the backtest.
 */
export interface SentAlert {
  scope: PulseScope;
  type: PulseAlertType;
  sentAt: Date;
}

export interface PulseAlertDecision {
  scope: PulseScope;
  type: PulseAlertType;
  /** The point that fired: carries value and drivers for the message. */
  point: PulsePoint;
  /** Human-readable trigger, for logs and the backtest report. */
  reason: string;
}

/** Number of categories whose `side` total reaches `PULSE_ALERT_CATEGORY_MIN_C`. */
export function countLiveCategories(
  categories: Partial<Record<PulseCategory, PulseCategoryRaw>>,
  side: keyof PulseCategoryRaw,
): number {
  return Object.values(categories).filter(
    (totals) => totals !== undefined && totals[side] >= PULSE_ALERT_CATEGORY_MIN_C,
  ).length;
}

/**
 * Point from a fresh `computePulse` result (the backtest's every point, and the
 * live notifier's current point). Null for an `insufficient` result, which is
 * not stored either.
 */
export function pulsePointFromComputation(
  scope: PulseScope,
  computedAt: Date,
  result: PulseComputation,
): PulsePoint | null {
  if (result.status !== 'ok') return null;
  return {
    scope,
    computedAt,
    bull: result.bull,
    bear: result.bear,
    value: result.value,
    conflict: result.conflict,
    bearCategories: countLiveCategories(result.categories, 'bear'),
    bullCategories: countLiveCategories(result.categories, 'bull'),
    drivers: result.drivers.map(({ signalId, label, display, c }) => ({
      signalId,
      label,
      display,
      c,
    })),
  };
}

/** History point from a stored `market_pulse` row; category counts are unknown. */
export function pulsePointFromStored(row: PulseRow): PulsePoint {
  return {
    scope: row.scope,
    computedAt: row.computedAt,
    bull: row.bull,
    bear: row.bear,
    value: row.value,
    conflict: row.conflict,
    bearCategories: null,
    bullCategories: null,
    drivers: row.drivers.map((d) => ({
      signalId: d.signal_id,
      label: d.label,
      display: d.display,
      c: d.c,
    })),
  };
}

/**
 * Latest point strictly before `current` within `PULSE_ALERT_PREV_MAX_GAP_HOURS`,
 * or null. `history` is sorted ascending and holds only `current`'s scope.
 */
function previousPoint(history: readonly PulsePoint[], current: PulsePoint): PulsePoint | null {
  const t = current.computedAt.getTime();
  for (let i = history.length - 1; i >= 0; i--) {
    const point = history[i];
    const pt = point.computedAt.getTime();
    if (pt >= t) continue;
    return t - pt <= PULSE_ALERT_PREV_MAX_GAP_HOURS * MS_PER_HOUR ? point : null;
  }
  return null;
}

/**
 * Point nearest `current − 24h` within ±`PULSE_PREV24H_TOLERANCE_HOURS`,
 * strictly before `current`; the earlier one wins a tie. Same rule as the API's
 * `prev24h` (`loadPulseNear`), so the alert agrees with the ghost marker.
 */
export function point24hAgo(
  history: readonly PulsePoint[],
  current: PulsePoint,
): PulsePoint | null {
  const t = current.computedAt.getTime();
  const target = t - 24 * MS_PER_HOUR;
  const tolerance = PULSE_PREV24H_TOLERANCE_HOURS * MS_PER_HOUR;
  let best: PulsePoint | null = null;
  let bestDistance = Infinity;
  for (const point of history) {
    const pt = point.computedAt.getTime();
    const distance = Math.abs(pt - target);
    if (pt >= t || distance > tolerance) continue;
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Every alert type whose condition holds for `current`, before dedupe. */
function triggered(
  current: PulsePoint,
  history: readonly PulsePoint[],
): { type: PulseAlertType; reason: string }[] {
  const out: { type: PulseAlertType; reason: string }[] = [];

  if (
    current.bearCategories !== null &&
    current.bearCategories >= PULSE_ALERT_MIN_CATEGORIES &&
    current.bear >= PULSE_ALERT_BEAR_MIN
  ) {
    out.push({
      type: 'bear_confluence',
      reason: `bear ${current.bear} ≥ ${PULSE_ALERT_BEAR_MIN} across ${current.bearCategories} categories`,
    });
  }
  if (
    current.bullCategories !== null &&
    current.bullCategories >= PULSE_ALERT_MIN_CATEGORIES &&
    current.bull >= PULSE_ALERT_BULL_MIN
  ) {
    out.push({
      type: 'bull_confluence',
      reason: `bull ${current.bull} ≥ ${PULSE_ALERT_BULL_MIN} across ${current.bullCategories} categories`,
    });
  }

  if (current.conflict) {
    const previous = previousPoint(history, current);
    if (previous !== null && !previous.conflict) {
      out.push({
        type: 'conflict',
        reason: `entered Conflict (bull ${current.bull}, bear ${current.bear}); previous ${previous.computedAt.toISOString()} was not Conflict`,
      });
    }
  }

  const before = point24hAgo(history, current);
  if (before !== null) {
    const move = current.value - before.value;
    if (Math.abs(move) >= PULSE_REVERSAL_POINTS) {
      out.push({
        type: 'reversal',
        reason: `value ${formatSigned(before.value)} → ${formatSigned(current.value)} (${formatSigned(move)}) since ${before.computedAt.toISOString()}`,
      });
    }
  }

  return out;
}

/**
 * Alerts to send for the Pulse point computed at `now`, per scope.
 *
 * - **Which points:** for each scope, only its point with `computedAt` equal to
 *   `now`. A scope with no point at `now` (insufficient this run) gets nothing,
 *   so a stale point is never decided twice. `now` defaults to the latest
 *   `computedAt` in `series`; the live notifier passes the run's `now`, which
 *   `runPulse` stores as `computed_at`.
 * - **Bear / bull confluence:** bear (bull) index ≥ `PULSE_ALERT_BEAR_MIN`
 *   (`PULSE_ALERT_BULL_MIN`) and ≥ `PULSE_ALERT_MIN_CATEGORIES` distinct
 *   categories with a bear (bull) total ≥ `PULSE_ALERT_CATEGORY_MIN_C`. Needs the
 *   point's category counts; a point rebuilt from a stored row (null counts)
 *   never fires a confluence. Both sides can fire at once.
 * - **Conflict:** fires on entry only: the point is Conflict and the previous
 *   point (latest strictly earlier, at most `PULSE_ALERT_PREV_MAX_GAP_HOURS`
 *   before) is not. No previous point within that gap, including the very
 *   first point of a scope, means the state before is unknown, so nothing
 *   fires: a data gap cannot create a false enter. A Conflict that starts
 *   inside a gap is therefore not announced.
 * - **Reversal:** |value − value of the point nearest now − 24h| ≥
 *   `PULSE_REVERSAL_POINTS` (inclusive), the baseline picked within
 *   ±`PULSE_PREV24H_TOLERANCE_HOURS` exactly like the API's `prev24h`. Chosen
 *   over the max swing inside 24h so the alert matches the 24h ghost marker
 *   the operator sees on the bar. No baseline in tolerance: no reversal.
 * - **Dedupe:** a triggered (scope, type) is dropped when `sent` holds the same
 *   (scope, type) with `sentAt > now − PULSE_ALERT_DEDUPE_HOURS` (so the same
 *   hour on the next day may fire again). `sent` entries after `now` are
 *   ignored, which keeps a replay free of look-ahead.
 *
 * `series` holds every scope, in any order; duplicates of one (scope, time)
 * are not expected (the table is unique on it). Output is sorted by
 * `PULSE_SCOPES` order, then bear_confluence, bull_confluence, conflict,
 * reversal.
 */
export function decideNotifications(
  series: readonly PulsePoint[],
  sent: readonly SentAlert[],
  now?: Date,
): PulseAlertDecision[] {
  if (series.length === 0) return [];
  const nowMs = now?.getTime() ?? Math.max(...series.map((p) => p.computedAt.getTime()));
  const dedupeFrom = nowMs - PULSE_ALERT_DEDUPE_HOURS * MS_PER_HOUR;

  const decisions: PulseAlertDecision[] = [];
  for (const scope of PULSE_SCOPES) {
    const history = series
      .filter((p) => p.scope === scope && p.computedAt.getTime() <= nowMs)
      .sort((a, b) => a.computedAt.getTime() - b.computedAt.getTime());
    const current = history.at(-1);
    if (current === undefined || current.computedAt.getTime() !== nowMs) continue;

    const fired = triggered(current, history);
    const isDeduped = (type: PulseAlertType): boolean =>
      sent.some((s) => {
        const at = s.sentAt.getTime();
        return s.scope === scope && s.type === type && at > dedupeFrom && at <= nowMs;
      });

    for (const type of ALERT_TYPE_ORDER) {
      const hit = fired.find((f) => f.type === type);
      if (hit === undefined || isDeduped(type)) continue;
      decisions.push({ scope, type, point: current, reason: hit.reason });
    }
  }
  return decisions;
}
