/**
 * Data-access for `public.macro_readings` (spec 027, Slice 3). A failed query
 * throws; the caller (`collectMacro`) turns it into a `SourceStatus`.
 */

import { query } from '@/lib/db/client';

export interface MacroReadingInsert {
  series: string;
  /** `YYYY-MM-DD`. */
  obsDate: string;
  value: number;
}

/**
 * Upserts readings on `(series, obs_date)`. FRED revises published values, so a
 * conflict overwrites the value and refreshes `fetched_at`. Returns rows written.
 */
export async function upsertMacroReadings(
  readings: readonly MacroReadingInsert[],
): Promise<number> {
  if (readings.length === 0) return 0;

  const values: unknown[] = [];
  const rows = readings.map((r) => {
    const base = values.length;
    values.push(r.series, r.obsDate, r.value);
    return `($${base + 1}, $${base + 2}::date, $${base + 3}::numeric)`;
  });

  await query(
    `insert into public.macro_readings (series, obs_date, value)
     values ${rows.join(', ')}
     on conflict (series, obs_date) do update set
       value = excluded.value,
       fetched_at = now()`,
    values,
  );
  return readings.length;
}

/** Most recent `fetched_at` across all series, or null if the table is empty. */
export async function loadLastMacroFetchAt(): Promise<Date | null> {
  const rows = await query<{ fetched_at: string | Date | null }>(
    'select max(fetched_at) as fetched_at from public.macro_readings',
  );
  const value = rows[0]?.fetched_at ?? null;
  return value ? new Date(value) : null;
}

/**
 * The latest `perSeries` readings of each series in `series`, newest first.
 * `obs_date` is cast to text (`YYYY-MM-DD`) and `value` to a number so callers
 * never see a `Date` or a numeric string. A series with no rows is absent.
 */
export async function loadLatestMacroReadings(
  series: readonly string[],
  perSeries = 2,
): Promise<Record<string, Array<{ obsDate: string; value: number }>>> {
  const rows = await query<{ series: string; obs_date: string; value: string }>(
    `select series, obs_date::text as obs_date, value::text as value
       from (
         select series, obs_date, value,
                row_number() over (partition by series order by obs_date desc) as rn
           from public.macro_readings
          where series = any($1::text[])
       ) ranked
      where rn <= $2::int
      order by series, obs_date desc`,
    [series, perSeries],
  );
  const out: Record<string, Array<{ obsDate: string; value: number }>> = {};
  for (const row of rows) {
    (out[row.series] ??= []).push({ obsDate: row.obs_date, value: Number(row.value) });
  }
  return out;
}
