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

export const pool: Pool = globalThis.__dbPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dbPool = pool;
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
  const result = await pool.query<T>(text, params as unknown[] | undefined);
  return result.rows;
}
