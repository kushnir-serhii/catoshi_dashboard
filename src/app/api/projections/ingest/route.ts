import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { ROUTINE_SOURCE } from '@/consts/projections';
import { defaultIngestRunDeps, runIngest } from '@/lib/forecast/ingestRun';
import { checkIngestAuth } from '@/lib/ingestAuth';

/**
 * `POST /api/projections/ingest` (spec 020).
 *
 * The write half of the scheduled-forecast path: a Claude Routine produces a
 * batch from `GET /api/projections/inputs` and POSTs it here. This route makes
 * **no** model call. Auth, the mock-mode guard and JSON parsing live here; the
 * ceiling → resolve → validate → persist → revalidate flow is `runIngest`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = checkIngestAuth(request);
  if (auth === 'unconfigured') {
    return NextResponse.json({ error: 'Forecast ingest not configured' }, { status: 503 });
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json({
      producer: ROUTINE_SOURCE,
      accepted: [],
      storedCount: 0,
      skipped: [],
      mock: true,
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const { status, body } = await runIngest(payload, {
    ...defaultIngestRunDeps,
    // Invalidate only after a successful write (spec 020 §2.2): a failed persist
    // must leave the previously stored batch and its cache entry untouched.
    revalidate: () => revalidateTag('projections', { expire: 0 }),
  });

  return NextResponse.json(body, { status });
}
