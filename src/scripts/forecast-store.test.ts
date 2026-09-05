/**
 * Tests for spec 019, Slice 2's forecast batch cache read: `getLatestForecasts`
 * in src/lib/db/analytics.ts.
 *
 * Run:  npx tsx src/scripts/forecast-store.test.ts
 *
 * No real network, no real database. `getLatestForecasts` is exercised through
 * its injected `queryFn` seam (pattern: news-publish.test.ts / PublishNewsDeps).
 * Exits non-zero on failure.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

void (async () => {
  const { PROJECTION_SCHEMA_VERSION } = await import('@/consts/projections');
  const { getLatestForecasts } = await import('@/lib/db/analytics');

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

  function forecastRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      symbol: 'BTC',
      as_of: '2026-09-05T00:00:00.000Z',
      scenarios: {
        bull: [{ day: 1, price: 100000 }],
        base: [{ day: 1, price: 97000 }],
        bear: [{ day: 1, price: 90000 }],
        probabilities: { bull: 30, base: 50, bear: 20 },
      },
      anchor_price: '97000',
      confidence: 72,
      reasoning: ['reason one'],
      source: 'claude',
      model: 'claude-sonnet-4-6',
      schema_version: String(PROJECTION_SCHEMA_VERSION),
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  section('Mapping round trip');
  // -------------------------------------------------------------------------

  {
    const scenarios = {
      bull: [{ day: 1, price: 100000 }],
      base: [{ day: 1, price: 97000 }],
      bear: [{ day: 1, price: 90000 }],
      probabilities: { bull: 30, base: 50, bear: 20 },
    };
    const row = forecastRow({ scenarios });
    const { fn } = mockQueryFn(() => [row]);

    const result = await getLatestForecasts(['BTC'], 21_600_000, fn);

    check('returns exactly one projection', result.length === 1, String(result.length));
    const p = result[0];
    check('coin mapped from symbol', p?.coin === 'BTC');
    check(
      'currentPrice coerced from string anchor_price to number',
      p?.currentPrice === 97000 && typeof p?.currentPrice === 'number',
      String(p?.currentPrice),
    );
    check('bull array preserved', JSON.stringify(p?.bull) === JSON.stringify(scenarios.bull));
    check('base array preserved', JSON.stringify(p?.base) === JSON.stringify(scenarios.base));
    check('bear array preserved', JSON.stringify(p?.bear) === JSON.stringify(scenarios.bear));
    check(
      'scenarioProbabilities mapped from probabilities',
      JSON.stringify(p?.scenarioProbabilities) === JSON.stringify(scenarios.probabilities),
    );
    check('service mapped from source', p?.service === 'claude');
    check('model preserved', p?.model === 'claude-sonnet-4-6');
    check(
      'schemaVersion set to the current PROJECTION_SCHEMA_VERSION const',
      p?.schemaVersion === PROJECTION_SCHEMA_VERSION,
    );
  }

  // -------------------------------------------------------------------------
  section('Schema-version miss (guard lives in the SQL where clause)');
  // -------------------------------------------------------------------------

  {
    // Simulates what Postgres would return if the stored row's schema_version
    // didn't match the query's parameter: zero rows.
    const { fn, calls } = mockQueryFn(() => []);

    const result = await getLatestForecasts(['BTC'], 21_600_000, fn);
    check('zero rows from a schema-version mismatch → miss ([])', result.length === 0);

    const call = calls[0];
    check(
      'the SQL text filters on schema_version',
      typeof call?.text === 'string' && call.text.includes('schema_version'),
    );
    check(
      'the query params include the current schema version being filtered on',
      Array.isArray(call?.params) && call.params.includes(String(PROJECTION_SCHEMA_VERSION)),
      JSON.stringify(call?.params),
    );
  }

  // -------------------------------------------------------------------------
  section('Missing scenario miss');
  // -------------------------------------------------------------------------

  {
    // Missing scenarios.bear.
    const rowMissingBear = forecastRow({
      scenarios: {
        bull: [{ day: 1, price: 100000 }],
        base: [{ day: 1, price: 97000 }],
        probabilities: { bull: 30, base: 50, bear: 20 },
      },
    });
    const { fn: fn1 } = mockQueryFn(() => [rowMissingBear]);
    const result1 = await getLatestForecasts(['BTC'], 21_600_000, fn1);
    check('missing scenarios.bear → miss ([])', result1.length === 0, String(result1.length));

    // Missing scenarios.probabilities.
    const rowMissingProbabilities = forecastRow({
      scenarios: {
        bull: [{ day: 1, price: 100000 }],
        base: [{ day: 1, price: 97000 }],
        bear: [{ day: 1, price: 90000 }],
      },
    });
    const { fn: fn2 } = mockQueryFn(() => [rowMissingProbabilities]);
    const result2 = await getLatestForecasts(['BTC'], 21_600_000, fn2);
    check(
      'missing scenarios.probabilities → miss ([])',
      result2.length === 0,
      String(result2.length),
    );

    // Null anchor_price.
    const rowNullAnchor = forecastRow({ anchor_price: null });
    const { fn: fn3 } = mockQueryFn(() => [rowNullAnchor]);
    const result3 = await getLatestForecasts(['BTC'], 21_600_000, fn3);
    check('null anchor_price → miss ([])', result3.length === 0, String(result3.length));
  }

  // -------------------------------------------------------------------------
  section('Two-of-three batch miss (partial coverage is a miss for the whole batch)');
  // -------------------------------------------------------------------------

  {
    const btc = forecastRow({ symbol: 'BTC' });
    const eth = forecastRow({ symbol: 'ETH', model: 'claude-sonnet-4-6' });
    // SOL has no fresh/matching row — simulated by simply not returning one.
    const { fn } = mockQueryFn(() => [btc, eth]);

    const result = await getLatestForecasts(['BTC', 'ETH', 'SOL'], 21_600_000, fn);
    check(
      'partial coverage (2 of 3) returns [] rather than a 2-element array',
      result.length === 0,
      String(result.length),
    );
  }

  // -------------------------------------------------------------------------
  section('Bonus: full three-symbol coverage returns all three in requested order');
  // -------------------------------------------------------------------------

  {
    const btc = forecastRow({ symbol: 'BTC' });
    const eth = forecastRow({ symbol: 'ETH' });
    const sol = forecastRow({ symbol: 'SOL' });
    const { fn } = mockQueryFn(() => [btc, eth, sol]);

    const result = await getLatestForecasts(['BTC', 'ETH', 'SOL'], 21_600_000, fn);
    check('full coverage returns all three', result.length === 3, String(result.length));
    check(
      'order corresponds to the requested symbols array',
      result.map((p) => p.coin).join(',') === 'BTC,ETH,SOL',
      result.map((p) => p.coin).join(','),
    );
  }

  // -------------------------------------------------------------------------

  console.log(
    failures === 0
      ? `\nAll ${checks} checks passed.\n`
      : `\n${failures} of ${checks} checks FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
