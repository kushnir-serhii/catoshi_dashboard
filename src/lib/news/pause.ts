import { APP_SETTING_NEWS_PAUSE, NEWS_CLASSIFY_ENABLED } from '@/consts/news';
import { getAppSetting } from '@/lib/db/appSettings';

/**
 * Whether the product's one unattended model call — news classification
 * (`classifyNews`, spec 015) — is currently paused (spec 022 §2.9).
 *
 * The admin-toggled `public.app_settings` row is authoritative: value `'true'`
 * ⇒ paused, `'false'` ⇒ running. When the row is ABSENT (never toggled, or the
 * read failed) this falls back to the original `NEWS_CLASSIFY_ENABLED` env
 * semantics, so behaviour with no row is byte-for-byte what it was before
 * spec 022.
 *
 * Server-only: reads Postgres. The synchronous `isNewsClassificationPaused` in
 * `src/lib/freshness.ts` is the env-only view used by `/api/health` (which must
 * stay a cheap, unauthenticated read and is unchanged by spec 022).
 */
export async function isNewsClassificationPaused(): Promise<boolean> {
  const stored = await getAppSetting(APP_SETTING_NEWS_PAUSE);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return !NEWS_CLASSIFY_ENABLED;
}
