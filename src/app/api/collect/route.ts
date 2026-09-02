import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import { COLLECT_ASSETS } from '@/consts/collect';
import type { MarketSnapshot, SourceStatus } from '@/data/types';
import { upsertSnapshot } from '@/lib/db/analytics';
import { persistCollectorStatus, reduceSourceStatuses } from '@/lib/db/collectorStatus';
import { resolveForecasts } from '@/lib/scoring/resolve';
import { generateSignals } from '@/lib/signals/generate';
import { buildSnapshot } from '@/lib/snapshotBuilder';

/**
 * Cron-triggered hourly market-snapshot collection endpoint (spec 010,
 * Slice 5). Scheduling (GitHub Actions / cron) is Slice 7's job — this route
 * only needs to be safely callable on demand.
 *
 * Method: POST. A cron trigger with a secret bearer token reads naturally as
 * "perform an action" rather than "fetch a resource", and POST keeps this
 * off any GET-based cache/prefetch path.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, compared with
 * `crypto.timingSafeEqual` (AC 2.6) rather than `===`, so response-time
 * differences can't leak how many leading characters matched. Runs before
 * any DB/network work — a failed check does nothing else.
 *
 * GET support (Slice 7): Vercel's native Cron Jobs feature — the daily
 * fallback in `vercel.json` (technical-considerations.md §2.2, §5) — always
 * invokes the configured path with a **GET** request; the method is not
 * configurable. It does auto-inject `Authorization: Bearer <value>` using
 * the project's own `CRON_SECRET` env var, so the header shape already
 * matches this route's expectation. The method didn't, so `GET` is exported
 * below as a thin alias of `POST` rather than leaving the daily fallback to
 * 405 forever. GitHub Actions (the primary, hourly path) keeps using POST.
 */

const AUTH_PREFIX = 'Bearer ';

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured: refuse everything rather than accepting an
    // unauthenticated write. This is a deploy misconfiguration, not a
    // request to skip.
    return false;
  }

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith(AUTH_PREFIX)) {
    return false;
  }
  const provided = header.slice(AUTH_PREFIX.length);

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on mismatched-length buffers, so guard that first
  // — a length mismatch is itself not sensitive (the secret's length isn't a
  // secret), only which characters matched is.
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Truncates a Date to the top of its hour (zero minutes/seconds/ms), UTC-based. */
function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCMinutes(0, 0, 0);
  return truncated;
}

async function handleCollect(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Server-side hour truncation only — never trust a client-supplied
  // timestamp, so schedule drift can't create duplicate hourly rows (the
  // `UNIQUE (asset_id, ts)` + upsert depends on every run in the same hour
  // computing the identical `ts`).
  const hourTs = truncateToHour(new Date());

  const sourcesBySymbol: Record<string, SourceStatus[]> = {};
  const committedSnapshots: { symbol: string; snapshot: MarketSnapshot }[] = [];
  let written = 0;
  let anyAssetSucceeded = false;

  // Sequential across assets: each asset's own fetches are already fully
  // parallel (buildSnapshot fans out via Promise.allSettled), so the only
  // thing sequential-across-assets buys or costs here is external API load.
  // Binance/CoinGecko/Farside rate limits are keyed per-IP, not per-request,
  // and 3 assets is a small, fixed loop — sequential keeps this run's peak
  // concurrent request count to "one asset's fan-out" instead of "three
  // assets' fan-out simultaneously," which is kinder to those upstream
  // limits for a negligible latency cost (a few seconds either way, no
  // interactive caller is waiting on this response). Parallel-across-assets
  // would be a reasonable alternative; this is a judgment call, not a hard
  // constraint from the spec.
  for (const asset of COLLECT_ASSETS) {
    try {
      const { snapshot, sources } = await buildSnapshot(asset.symbol, hourTs);
      sourcesBySymbol[asset.symbol] = sources;

      const { data, error } = await upsertSnapshot(snapshot);
      if (error || !data) {
        sourcesBySymbol[asset.symbol].push({
          source: 'db:upsertSnapshot',
          ok: false,
          error: error?.message ?? 'upsert returned no data',
        });
        continue;
      }
      written += 1;
      anyAssetSucceeded = true;
      committedSnapshots.push({ symbol: asset.symbol, snapshot: data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sourcesBySymbol[asset.symbol] = [
        ...(sourcesBySymbol[asset.symbol] ?? []),
        { source: 'snapshotBuilder', ok: false, error: message },
      ];
    }
  }

  // Signal generation (spec 014, Slice 4). Runs only after every snapshot for
  // this hour has committed, so a signal can never reference an uncommitted
  // snapshot (technical-considerations §5, ordering). The whole step is
  // isolated: a failure here is logged and reported, but never fails the
  // collection run — snapshot data is unrecoverable, signals are regenerable.
  for (const { symbol, snapshot } of committedSnapshots) {
    try {
      const { sources } = await generateSignals(snapshot);
      if (sources.length > 0) {
        sourcesBySymbol[symbol] = [...(sourcesBySymbol[symbol] ?? []), ...sources];
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[collect] signal generation failed for ${symbol}:`, error);
      sourcesBySymbol[symbol] = [
        ...(sourcesBySymbol[symbol] ?? []),
        { source: 'signals', ok: false, error: message },
      ];
    }
  }

  // Forecast resolution and scoring (spec 011, Slice 4). Same placement and
  // reasoning as signal generation above: it runs only after this hour's
  // snapshots have committed (the resolver reads snapshot prices to establish
  // entry and horizon prices), and it is fully isolated — a scoring failure is
  // logged and surfaced through SourceStatus but never fails the collection
  // run. The asymmetry is the point (technical-considerations §5): a lost
  // snapshot hour is gone forever, a lost scoring pass is recomputed next hour.
  try {
    const { sources: scoringSources } = await resolveForecasts();
    if (scoringSources.length > 0) {
      sourcesBySymbol.scoring = [...(sourcesBySymbol.scoring ?? []), ...scoringSources];
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[collect] forecast resolution failed:', error);
    sourcesBySymbol.scoring = [
      ...(sourcesBySymbol.scoring ?? []),
      { source: 'scoring', ok: false, error: message },
    ];
  }

  // Per-source status persistence (spec 017, Slice 3). Same isolation discipline
  // as the signal/scoring steps above: a failure to write bookkeeping must never
  // fail a collection run. The last-success-per-source rows let `/api/health`
  // tell "one feed down for hours" apart from "one run failed".
  try {
    const outcomes = reduceSourceStatuses(
      sourcesBySymbol,
      COLLECT_ASSETS.map((a) => a.symbol),
    );
    const { error } = await persistCollectorStatus(outcomes);
    if (error) {
      sourcesBySymbol.collectorStatus = [
        ...(sourcesBySymbol.collectorStatus ?? []),
        { source: 'db:collectorStatus', ok: false, error: error.message },
      ];
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[collect] collector-status persistence failed:', error);
    sourcesBySymbol.collectorStatus = [
      ...(sourcesBySymbol.collectorStatus ?? []),
      { source: 'db:collectorStatus', ok: false, error: message },
    ];
  }

  // Field-level/per-source failure is allowed (AC 2.2) and still reports
  // 200 — only a total inability to write anything at all is treated as a
  // failed run.
  const status = anyAssetSucceeded ? 200 : 502;
  return NextResponse.json(
    { ok: anyAssetSucceeded, written, sources: sourcesBySymbol },
    { status },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCollect(request);
}

/** Vercel Cron fallback — see the GET-support note above. */
export async function GET(request: Request): Promise<NextResponse> {
  return handleCollect(request);
}
