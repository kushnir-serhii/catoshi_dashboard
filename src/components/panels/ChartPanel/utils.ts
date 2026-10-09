import { formatPrice } from '@/lib/projectionSeries';

/** Formats a scenario badge's price + %-vs-livePrice, e.g. "$314.8K · +27%".
 * Falls back to an em-dash when `value` is unavailable (no sane forecast). */
export function formatBadgeValue(value: number | undefined, livePrice: number | undefined): string {
  if (value === undefined || livePrice === undefined || livePrice === 0) return '—';
  const pct = ((value - livePrice) / livePrice) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${formatPrice(value)} · ${sign}${Math.abs(pct).toFixed(0)}%`;
}

/** Plain-words age of a timestamp, e.g. "just now", "3 minutes ago", "2 hours ago". */
export function formatAge(timestampMs: number): string {
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here. This
  // is a live age — `now - timestampMs` — where `timestampMs` is the moment a
  // genuinely new live price/history value last arrived (set in an effect only
  // when the value actually changes, see `useProjectionChart`). Live CoinGecko
  // prices carry no upstream timestamp, so "when we last received a fresh value"
  // is the honest freshness signal, and the age recomputes as it should on
  // re-render. Not the shipped defect: the label never claims freshness the data
  // does not have.
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
}
