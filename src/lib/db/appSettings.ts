import { query } from '@/lib/db/client';

/**
 * Data-access for `public.app_settings` (migration 0010, spec 022 §2.9) — the
 * small key/value store for admin-tunable settings such as the
 * news-classification pause. Server-only; never import into a client component.
 *
 * `getAppSetting` swallows a read failure and returns `null` (row absent),
 * deliberately: every caller treats "no row" as "fall back to the env default",
 * which is the safe direction when the database is briefly unreachable.
 */

interface SettingRow {
  value: string | null;
}

/** The stored string value for `key`, or `null` when there is no row (or the read failed). */
export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const rows = await query<SettingRow>(`select value from public.app_settings where key = $1`, [
      key,
    ]);
    return rows.length > 0 ? rows[0].value : null;
  } catch (error: unknown) {
    console.error('[appSettings] getAppSetting failed:', error);
    return null;
  }
}

/**
 * Upserts one setting on `key`, stamping `updated_at = now()` and recording the
 * admin who wrote it (`updatedBy`, `null` for a system process). Throws on a
 * write failure so the calling Route Handler can answer 503.
 */
export async function setAppSetting(
  key: string,
  value: string,
  updatedBy: number | null,
): Promise<void> {
  await query(
    `insert into public.app_settings (key, value, updated_by, updated_at)
     values ($1, $2, $3, now())
     on conflict (key) do update
       set value = excluded.value,
           updated_by = excluded.updated_by,
           updated_at = now()`,
    [key, value, updatedBy],
  );
}
