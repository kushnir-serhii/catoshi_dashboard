import { NextResponse } from 'next/server';

import { APP_SETTING_NEWS_PAUSE } from '@/consts/news';
import { requireAdmin } from '@/lib/auth/authorize';
import { setAppSetting } from '@/lib/db/appSettings';
import { isNewsClassificationPaused } from '@/lib/news/pause';

/**
 * `/api/admin/settings/news-pause` — the admin-facing pause switch for
 * unattended news classification (spec 022 §2.9), replacing the operator-only
 * `NEWS_CLASSIFY_ENABLED` env var.
 *
 *   GET   → `{ paused }`, the effective state (`app_settings` row, or env fallback)
 *   PATCH → body `{ paused: boolean }`, upserts the `app_settings` row, `{ paused }`
 *
 * `requireAdmin()` is the authorization boundary on both: 401 for a guest, 403
 * for a signed-in non-admin.
 */
export const dynamic = 'force-dynamic';

interface NewsPauseBody {
  paused?: unknown;
}

function refusal(status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? 'Admin access required' : 'Sign in required' },
    { status },
  );
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return refusal(auth.status);
  }
  const paused = await isNewsClassificationPaused();
  return NextResponse.json({ paused });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return refusal(auth.status);
  }

  let body: NewsPauseBody = {};
  try {
    body = (await request.json()) as NewsPauseBody;
  } catch {
    // fall through to validation
  }
  if (typeof body.paused !== 'boolean') {
    return NextResponse.json({ error: 'body.paused must be a boolean' }, { status: 400 });
  }

  try {
    await setAppSetting(APP_SETTING_NEWS_PAUSE, String(body.paused), auth.user.id);
  } catch (error: unknown) {
    console.error('[admin/settings/news-pause] write failed:', error);
    return NextResponse.json({ error: 'Could not update the setting' }, { status: 503 });
  }

  return NextResponse.json({ paused: body.paused });
}
