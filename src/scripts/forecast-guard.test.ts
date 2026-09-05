/**
 * Tests for spec 019, Slice 3's cost-control guards:
 *
 *   - `matchesAdminSecret` in src/lib/adminAuth.ts — the ceiling counts
 *     generations not rows, a failed count refuses, and the credential
 *     comparison is length-safe and rejects a wrong secret.
 *   - `getDailyForecastGenerationCount` in src/lib/db/analytics.ts.
 *
 * Run:  npx tsx src/scripts/forecast-guard.test.ts
 *
 * No real network, no real database. `getDailyForecastGenerationCount` is
 * exercised through its injected `queryFn` seam (pattern: forecast-store.test.ts
 * / news-publish.test.ts's PublishNewsDeps). Exits non-zero on failure.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

void (async () => {
  const { matchesAdminSecret } = await import('@/lib/adminAuth');
  const { getDailyForecastGenerationCount } = await import('@/lib/db/analytics');

  let failures = 0;
  let checks = 0;
  function check(name: string, ok: boolean, detail = ''): void {
    checks++;
    if (!ok) {
      failures++;
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }
  function section(title: string): void {
    console.log(`\n${title}`);
  }

  type QueryCall = { text: string; params: readonly unknown[] | undefined };

  function mockQueryFn(rowsBySql: (call: QueryCall) => Record<string, unknown>[]) {
    const calls: QueryCall[] = [];
    const fn = async (text: string, params?: readonly unknown[]) => {
      const call = { text, params };
      calls.push(call);
      return rowsBySql(call);
    };
    return { fn: fn as unknown as typeof import('@/lib/db/client').query, calls };
  }

  function mockRejectingQueryFn(error: Error) {
    const fn = async () => {
      throw error;
    };
    return fn as unknown as typeof import('@/lib/db/client').query;
  }

  // ---------------------------------------------------------------------
  section('matchesAdminSecret: equal strings match');
  // ---------------------------------------------------------------------

  {
    check('matching secret/provided → true', matchesAdminSecret('super-secret', 'super-secret'));
  }

  // ---------------------------------------------------------------------
  section('matchesAdminSecret: wrong secret, same length');
  // ---------------------------------------------------------------------

  {
    check(
      'wrong secret, same length → false',
      matchesAdminSecret('super-secret', 'super-secrxt') === false,
    );
  }

  // ---------------------------------------------------------------------
  section('matchesAdminSecret: wrong secret, different length — length-safe, never throws');
  // ---------------------------------------------------------------------

  {
    let threw = false;
    let result: boolean | undefined;
    try {
      result = matchesAdminSecret('short', 'a-very-different-and-much-longer-string');
    } catch {
      threw = true;
    }
    check('does not throw on mismatched-length buffers', !threw);
    check('returns false rather than throwing', result === false, String(result));
  }

  // ---------------------------------------------------------------------
  section('matchesAdminSecret: empty strings on both sides');
  // ---------------------------------------------------------------------

  {
    check('empty/empty (equal, zero-length) → true', matchesAdminSecret('', '') === true);
  }

  // ---------------------------------------------------------------------
  section('getDailyForecastGenerationCount: counts generations not rows');
  // ---------------------------------------------------------------------

  {
    // Simulates 9 total forecast rows spanning 3 generations of 3 coins each —
    // Postgres's count(distinct as_of) correctly collapses that to 3.
    const { fn, calls } = mockQueryFn(() => [{ count: '3' }]);

    const result = await getDailyForecastGenerationCount(fn);

    check('returns the number 3 (generations), not 9 (rows)', result === 3, String(result));
    check('return value is a number, not a string', typeof result === 'number');

    const call = calls[0];
    check(
      'the SQL text counts distinct as_of, not count(*)',
      typeof call?.text === 'string' && /distinct\s+as_of/i.test(call.text),
      call?.text,
    );
  }

  // ---------------------------------------------------------------------
  section('getDailyForecastGenerationCount: a failed count refuses');
  // ---------------------------------------------------------------------

  {
    const fn = mockRejectingQueryFn(new Error('connection reset'));

    let threw = false;
    let result: number | null | undefined;
    try {
      result = await getDailyForecastGenerationCount(fn);
    } catch {
      threw = true;
    }

    check('does not throw out of the function', !threw);
    check('returns null on failure (never 0)', result === null, String(result));
  }

  // ---------------------------------------------------------------------
  section('getDailyForecastGenerationCount: bonus success case — zero generations today');
  // ---------------------------------------------------------------------

  {
    const { fn } = mockQueryFn(() => [{ count: '0' }]);

    const result = await getDailyForecastGenerationCount(fn);

    check('returns the number 0 for a day with zero generations', result === 0, String(result));
    check('0 is distinct from null (both handled distinctly by callers)', result !== null);
  }

  // ---------------------------------------------------------------------

  console.log(
    failures === 0
      ? `\nAll ${checks} checks passed.\n`
      : `\n${failures} of ${checks} checks FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
