/** Pure time-formatting helpers for the Market Pulse UI (viewer's local time zone). */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "UTC+02:00" / "UTC−05:30" for a `getTimezoneOffset()` value (minutes, west-positive). */
export function formatUtcOffset(offsetMinutes: number): string {
  const east = -offsetMinutes;
  const sign = east >= 0 ? '+' : '−';
  const abs = Math.abs(east);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** "10:00 (UTC+02:00)" in the viewer's local zone. Empty string for an invalid ISO. */
export function formatLocalTimeWithOffset(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${hhmm(d)} (${formatUtcOffset(d.getTimezoneOffset())})`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "today 20:00", "tomorrow 09:30" or "Fri 14:00" in the viewer's local zone, relative to `now`. */
export function formatEventWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  let day: string;
  if (dayDiff === 0) day = 'today';
  else if (dayDiff === 1) day = 'tomorrow';
  else day = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${hhmm(d)}`;
}
