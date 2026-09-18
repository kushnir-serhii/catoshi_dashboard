import { Pool, type QueryResultRow } from 'pg';

/**
 * Singleton `pg` Pool over the pooled Neon connection (`DATABASE_URL`).
 *
 * Next.js dev mode hot-reloads route/module code on every request, which
 * would otherwise re-run this module and open a fresh Pool each time,
 * eventually exhausting Neon's connection limit. Caching the Pool on
 * `globalThis` (the standard Prisma-style singleton pattern) survives
 * hot-reload re-evaluation in development. In production each serverless
 * invocation gets its own module registry, so this is a no-op there — the
 * cache only ever holds the one Pool created for that invocation's lifetime.
 */

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({ connectionString });
}

/**
 * Returns the shared pool, creating it on first use.
 *
 * Deliberately lazy. This used to be `export const pool = createPool()`, which
 * ran at **import** time — so merely importing any module that transitively
 * reached this file threw `DATABASE_URL is not set` when the variable was
 * absent, even if no query was ever issued. That made
 * `snapshot-builder.test.ts` unrunnable without a database despite testing
 * only the pure `assembleSnapshot` (its header says "No database, no
 * network" — with an eager pool that claim was false, because
 * `snapshotBuilder.ts` imports `query` for `resolveAssetId`).
 *
 * Connecting is a side effect; an import is not the place for it.
 */
let cachedPool: Pool | undefined;

export function getPool(): Pool {
  // Module-level cache first: in production nothing is written to
  // `globalThis`, so without this every call would build a new Pool and
  // exhaust the connection limit. The global is only the dev/HMR mirror, so
  // a module reload reuses the same pool instead of leaking one per reload.
  cachedPool ??= globalThis.__dbPool ?? createPool();

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__dbPool = cachedPool;
  }
  return cachedPool;
}

/**
 * Runs a parameterized SQL query against the shared pool and returns the
 * result rows, typed as `T[]`. Callers are responsible for asserting the
 * shape of `T` matches the query's column list — this helper does no
 * runtime validation, it only forwards to `pg`.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[] | undefined);
  return result.rows;
}
