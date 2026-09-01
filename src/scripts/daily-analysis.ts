/**
 * Local, ad-hoc trigger for the same collection logic `/api/collect` runs
 * hourly in production (spec 010, Slice 7 — see technical-considerations.md
 * §5, "`npm run daily-analysis` points at an empty directory").
 *
 * `/api/collect` already provides an on-demand trigger via GitHub Actions'
 * `workflow_dispatch`, but that requires a deployed URL and the production
 * `CRON_SECRET` — this script needs neither. It talks to `DATABASE_URL`
 * directly, which is useful for:
 *   - a developer backfilling/testing a snapshot without deploying anything
 *   - verifying `buildSnapshot()` / `upsertSnapshot()` against a local or
 *     branch database before trusting the deployed cron
 *
 * It intentionally does NOT re-implement `/api/collect`'s HTTP auth, hour
 * truncation edge cases, or per-source status response shape beyond a
 * console summary — those stay the single source of truth in the route
 * handler. This script is a thin CLI wrapper around the exact same
 * `buildSnapshot` + `upsertSnapshot` calls, run once for every tracked asset.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx src/scripts/daily-analysis.ts
 *   npm run daily-analysis   (package.json wires the flags above)
 */
import { COLLECT_ASSETS } from '@/consts/collect';
import { upsertSnapshot } from '@/lib/db/analytics';
import { buildSnapshot } from '@/lib/snapshotBuilder';

/** Truncates a Date to the top of its hour (zero minutes/seconds/ms), UTC-based. */
function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCMinutes(0, 0, 0);
  return truncated;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Run with: node --env-file=.env.local --import tsx src/scripts/daily-analysis.ts');
    process.exitCode = 1;
    return;
  }

  const hourTs = truncateToHour(new Date());
  console.log(`daily-analysis: building snapshots for hour ${hourTs.toISOString()}`);

  let written = 0;
  let failed = 0;

  for (const asset of COLLECT_ASSETS) {
    try {
      const { snapshot, sources } = await buildSnapshot(asset.symbol, hourTs);
      const failedSources = sources.filter((s) => !s.ok);
      if (failedSources.length > 0) {
        console.warn(
          `  ${asset.symbol}: ${failedSources.length} source(s) failed -`,
          failedSources.map((s) => `${s.source} (${s.error ?? 'unknown'})`).join(', '),
        );
      }

      const { data, error } = await upsertSnapshot(snapshot);
      if (error || !data) {
        console.error(`  ${asset.symbol}: upsert failed -`, error?.message ?? 'no data returned');
        failed += 1;
        continue;
      }
      console.log(`  ${asset.symbol}: ok - price=${snapshot.price}`);
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ${asset.symbol}: snapshot build failed -`, message);
      failed += 1;
    }
  }

  console.log(`daily-analysis: ${written} written, ${failed} failed`);
  if (written === 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error('daily-analysis: fatal error', error);
    process.exitCode = 1;
  })
  .finally(() => {
    // The `pg` Pool keeps the process alive otherwise (see src/lib/db/client.ts).
    process.exit(process.exitCode ?? 0);
  });
