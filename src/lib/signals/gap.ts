import { SIGNALS_PREV_GAP_MAX_MINUTES, SIGNALS_PREV_GAP_MIN_MINUTES } from '@/consts/signals';
import type { MarketSnapshot } from '@/data/types';

const MS_PER_MINUTE = 60_000;

/**
 * True when `previous` sits one collection interval before `snapshot`, within
 * the cron-lateness tolerance. A larger gap means a 3h change would be passed
 * off as a 1h one, so callers return null (technical-considerations §4.2).
 */
export function previousWithinGap(
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null,
): previous is MarketSnapshot {
  if (previous == null) {
    return false;
  }
  const now = Date.parse(snapshot.ts);
  const before = Date.parse(previous.ts);
  if (Number.isNaN(now) || Number.isNaN(before)) {
    return false;
  }
  const gapMinutes = (now - before) / MS_PER_MINUTE;
  return gapMinutes >= SIGNALS_PREV_GAP_MIN_MINUTES && gapMinutes <= SIGNALS_PREV_GAP_MAX_MINUTES;
}

/** Price % change from `previous` to `snapshot`, or null on a missing/zero base or a gap violation. */
export function priceChange1hPct(
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null,
): number | null {
  if (!previousWithinGap(snapshot, previous)) {
    return null;
  }
  if (previous.price == null || previous.price === 0 || snapshot.price == null) {
    return null;
  }
  return ((snapshot.price - previous.price) / previous.price) * 100;
}

/** Open-interest % change from `previous` to `snapshot`, or null on a missing/zero base or a gap violation. */
export function oiChange1hPct(
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null,
): number | null {
  if (!previousWithinGap(snapshot, previous)) {
    return null;
  }
  const now = snapshot.openInterestUsd;
  const before = previous.openInterestUsd;
  if (now == null || before == null || before === 0) {
    return null;
  }
  return ((now - before) / before) * 100;
}
