/**
 * How long the condition behind a signal has held, derived from `since` vs now
 * (spec 014 slice 5) — "for 6h", "for 3d". Sub-hour conditions read "just now".
 */
export function formatDuration(since: string): string {
  // Freshness audit (spec 017, Slice 2): render-time `now` is correct here. This
  // is a live age — `now - since` — where `since` (a data timestamp) is the
  // other operand, so it reports how long the condition has genuinely held. Not
  // the shipped defect (`decisions.md` §3, instance 2).
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 60 * 60 * 1000) return 'just now';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `for ${hours}h`;
  return `for ${Math.round(hours / 24)}d`;
}

/** "MM-DD" of a FRED observation date (a calendar date, so read in UTC). */
export function macroObservedLabel(since: string): string {
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return 'n/a';
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
