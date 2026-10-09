/**
 * Macro calendar loader (spec 027, Slice 3).
 *
 * Reads `src/data/macro-calendar.json`, which is maintained by hand, and
 * exports pure functions to query the calendar's staleness and next event.
 * The calendar is used by `/api/pulse` to report the next economic event
 * within 72 hours and by `/api/health` to warn when the calendar is stale.
 */

import {
  MACRO_CALENDAR_HEALTH_WARN_DAYS,
  MACRO_CALENDAR_LOOKAHEAD_HOURS,
  MACRO_CALENDAR_STALE_DAYS,
} from '@/consts/macro';
import calendarData from '@/data/macro-calendar.json';

/** An event in the macro calendar. */
export interface MacroCalendarEvent {
  ts: string; // ISO 8601 timestamp
  title: string;
  importance: 'high' | 'medium';
}

/** Shape of the macro-calendar.json file. */
interface MacroCalendarData {
  updated: string; // YYYY-MM-DD
  events: MacroCalendarEvent[];
}

/**
 * Number of days since the calendar was last updated.
 * Takes `now` as a parameter for deterministic testing.
 */
export function calendarAgeDays(now: number | Date = Date.now()): number {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const lastUpdated = new Date(`${(calendarData as MacroCalendarData).updated}T00:00:00Z`);
  const ageMs = nowMs - lastUpdated.getTime();
  return Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
}

/**
 * True when the calendar is older than `MACRO_CALENDAR_STALE_DAYS` (30 days).
 * When stale, assume the calendar is out of date relative to published
 * schedules and don't report the next event (spec 027 technical §6.1).
 */
export function isCalendarStale(now: number | Date = Date.now()): boolean {
  return calendarAgeDays(now) > MACRO_CALENDAR_STALE_DAYS;
}

/**
 * True when the calendar age is >= `MACRO_CALENDAR_HEALTH_WARN_DAYS` (21 days).
 * Used by `/api/health` to issue a staleness warning before the calendar becomes
 * fully stale (spec 027, Slice 3 §5).
 */
export function calendarAgeWarning(now: number | Date = Date.now()): boolean {
  return calendarAgeDays(now) >= MACRO_CALENDAR_HEALTH_WARN_DAYS;
}

/**
 * The next event in the calendar that falls within the lookahead window
 * (72 hours from now), or null if the calendar is stale or there is no
 * upcoming event in the window (spec 027 technical §6.1).
 */
export function nextEvent(
  now: number | Date = Date.now(),
  lookaheadHours: number = MACRO_CALENDAR_LOOKAHEAD_HOURS,
): MacroCalendarEvent | null {
  if (isCalendarStale(now)) {
    return null;
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  const horizonMs = nowMs + lookaheadHours * 60 * 60 * 1000;

  const data = calendarData as MacroCalendarData;
  for (const event of data.events) {
    const eventMs = new Date(event.ts).getTime();
    if (eventMs > nowMs && eventMs <= horizonMs) {
      return event;
    }
  }

  return null;
}
