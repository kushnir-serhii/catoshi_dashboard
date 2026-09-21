/**
 * Pure display helpers for the Today card (spec 024 Slice 3). No React, no
 * globals: the clock is always passed in.
 */

import {
  TODAY_MIN_HORIZON_HOURS,
  TODAY_MIN_TRACK_DAYS,
  TODAY_NEXT_24H_HOURS,
  TODAY_SIGMA_K,
  TODAY_TRACK_WINDOW_DAYS,
} from '@/consts/today';
import type { TodayQuantiles } from '@/lib/todayRange';

export type TodayHorizon = 'rest' | '24h';

/** BTC/ETH/SOL only (the set `TODAY_SIGMA_K` is keyed by). */
export function isTodayTracked(coinId: string): boolean {
  return TODAY_SIGMA_K[coinId] !== undefined;
}

/**
 * Integers, "<1%" and ">99%". Never "0%" or "100%": `touchAtSpot` is the one
 * case (level equals spot) where the touch probability is exactly 100%.
 */
export function formatProbability(p: number, opts: { touchAtSpot?: boolean } = {}): string {
  if (opts.touchAtSpot) return '100%';
  if (!Number.isFinite(p)) return '—';
  const pct = p * 100;
  if (pct < 1) return '<1%';
  if (pct > 99) return '>99%';
  return `${Math.min(99, Math.max(1, Math.round(pct)))}%`;
}

/** "10h 34m" from fractional hours; under an hour "42m". */
export function formatTimeLeft(hours: number): string {
  const totalMin = Math.max(0, Math.floor(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "40s ago" / "3m ago" / "2h ago"; under a second (or clock skew) is "just now". */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** Price with thousands separators; decimals shrink as the price grows. */
export function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const decimals = v >= 1000 ? 0 : v >= 100 ? 1 : v >= 1 ? 2 : 4;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Plain-number string for the level input (no grouping, so it round-trips through `parseLevel`). */
export function formatLevelInput(v: number): string {
  if (v >= 100) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toPrecision(4);
}

/** Parses the level field; accepts "2,760.5" and "$2760". Null when not a positive number. */
export function parseLevel(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Level `pct` percent away from `spot` (e.g. -2 = 2% below). */
export function levelFromPct(spot: number, pct: number): number {
  return spot * (1 + pct / 100);
}

/** Signed chip label with a real minus sign: "−2%", "+1%". */
export function formatChipPct(pct: number): string {
  return `${pct < 0 ? '−' : '+'}${Math.abs(pct)}%`;
}

export type LevelSide = 'above' | 'below' | 'at';

export function levelSide(spot: number, level: number): LevelSide {
  if (level > spot) return 'above';
  if (level < spot) return 'below';
  return 'at';
}

export interface ResolvedHorizon {
  horizon: TodayHorizon;
  hoursT: number;
  /** Rest-of-day chip is unusable (less than the model's minimum left). */
  restDisabled: boolean;
}

/** Applies the auto-fallback: under `TODAY_MIN_HORIZON_HOURS` left, "Next 24h" is forced. */
export function resolveHorizon(selected: TodayHorizon, hoursLeftToday: number): ResolvedHorizon {
  const restDisabled = !(hoursLeftToday >= TODAY_MIN_HORIZON_HOURS);
  const horizon: TodayHorizon = restDisabled ? '24h' : selected;
  return {
    horizon,
    hoursT: horizon === 'rest' ? hoursLeftToday : TODAY_NEXT_24H_HOURS,
    restDisabled,
  };
}

export interface BandLayout {
  /** All values are percentages (0..100) along the bar. */
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  spot: number;
  /** Null when the level falls outside the drawn domain. */
  level: number | null;
}

/**
 * Positions for the range bar: the domain is the 90% range padded by 15% of its
 * width each side, so the band never touches the edges. Linear on the price
 * axis, which is honest at intraday widths.
 */
export function bandLayout(q: TodayQuantiles, spot: number, level: number | null): BandLayout {
  const pad = (q.p95 - q.p05) * 0.15;
  const min = q.p05 - pad;
  const span = q.p95 + pad - min;
  const pos = (v: number): number => (span > 0 ? ((v - min) / span) * 100 : 50);
  const lvl = level === null ? null : pos(level);
  return {
    p05: pos(q.p05),
    p25: pos(q.p25),
    p75: pos(q.p75),
    p95: pos(q.p95),
    spot: pos(spot),
    level: lvl !== null && lvl >= 0 && lvl <= 100 ? lvl : null,
  };
}

/**
 * Track-record line. `null` track renders nothing; below the minimum sample it
 * shows the "builds" note; at or above it the measured hit count.
 */
export function formatTrackLine(track: { n: number; held90: number } | null): string | null {
  if (track === null) return null;
  if (track.n < TODAY_MIN_TRACK_DAYS) {
    return `Track record builds after ${TODAY_MIN_TRACK_DAYS} days (n so far: ${track.n}).`;
  }
  const windowDays = Math.min(track.n, TODAY_TRACK_WINDOW_DAYS);
  return `Last ${TODAY_TRACK_WINDOW_DAYS} days: the 90% range held on ${track.held90} of ${windowDays} days.`;
}
