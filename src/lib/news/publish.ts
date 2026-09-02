/**
 * News publication (spec 015, Slice 5).
 *
 * The third and cheapest stage of the pipeline: it calls no model and touches
 * no external service. It copies each classified headline into `public.signals`
 * as a `kind = 'news'` row so the existing feed query picks it up, then stops.
 *
 * Discipline, mirroring `classifyNews`:
 *   - Fully isolated inside `/api/collect`: a failure here is logged, surfaced
 *     through `SourceStatus`, and never fails the collection run.
 *   - Idempotent: the underlying INSERT…SELECT…ON CONFLICT DO NOTHING publishes
 *     each classified item exactly once, so running it every collection is safe.
 *   - Mock mode: no DB, a no-op ok status.
 */

import type { SourceStatus } from '@/data/types';
import { publishNewsSignals } from '@/lib/db/news';

const SOURCE = 'news:publish';

export interface PublishNewsDeps {
  /** Injected publish seam (tests). Defaults to the real DB write. */
  publish?: () => Promise<{ published: number }>;
}

export interface PublishNewsResult {
  sources: SourceStatus[];
  /** Signal rows inserted this run. */
  published: number;
}

export async function publishNews(deps: PublishNewsDeps = {}): Promise<PublishNewsResult> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return { sources: [{ source: SOURCE, ok: true }], published: 0 };
  }

  const publish = deps.publish ?? publishNewsSignals;

  try {
    const { published } = await publish();
    return { sources: [{ source: SOURCE, ok: true }], published };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[news:publish] failed:', error);
    return { sources: [{ source: SOURCE, ok: false, error: message }], published: 0 };
  }
}
