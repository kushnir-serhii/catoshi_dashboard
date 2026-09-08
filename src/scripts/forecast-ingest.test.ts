/**
 * Ingest-guard + honest-surface tests for spec 020, Slices 3–4
 * (functional-spec §2.2 / §2.4 / §2.5).
 *
 * Run:  npx tsx src/scripts/forecast-ingest.test.ts
 *
 * No real network, no real database. `validateIngestBatch` and `checkIngestAuth`
 * are pure and tested directly; `runIngest`'s guard flow is tested with
 * in-memory seams injected through its dependency bag. Exits non-zero on
 * failure (pattern: src/scripts/news-classify.test.ts).
 */

// A DATABASE_URL must exist before `@/lib/db/client` is imported (transitively,
// via `@/lib/forecast/ingestRun`) — it builds a `pg.Pool` at module load. It is
// never connected to; every DB path is stubbed.
import type { StoredForecast } from '@/data/types';
import type { CollectorOutcome } from '@/lib/db/collectorStatus';
import type { IngestReferences } from '@/lib/forecast/ingest';
import type { IngestRunDeps } from '@/lib/forecast/ingestRun';

process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';

void (async () => {
  const {
    FORECAST_DAILY_INGEST_LIMIT,
    FORECAST_GRID_DAYS,
    DEFAULT_FORECAST_TARGETS,
    SCHEDULED_FORECAST_LATE_AFTER_SECONDS,
  } = await import('@/consts/projections');
  const { validateIngestBatch } = await import('@/lib/forecast/ingest');
  const { runIngest } = await import('@/lib/forecast/ingestRun');
  const { checkIngestAuth } = await import('@/lib/ingestAuth');
  const { forecastIngestState } = await import('@/lib/freshness');

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

  const ASOF = '2026-09-06T00:00:00.000Z';
  const OPTIONS = { asOf: ASOF, targets: DEFAULT_FORECAST_TARGETS };

  const REFERENCE_PRICE: Record<string, number> = { BTC: 100_000, ETH: 4_000, SOL: 200 };

  function references(overrides: Partial<IngestReferences> = {}): IngestReferences {
    return {
      BTC: { referencePrice: REFERENCE_PRICE.BTC, hasAsset: true },
      ETH: { referencePrice: REFERENCE_PRICE.ETH, hasAsset: true },
      SOL: { referencePrice: REFERENCE_PRICE.SOL, hasAsset: true },
      ...overrides,
    };
  }

  /** One {d,p} point per grid day — a scenario dense enough to snap. */
  function fullScenario(start: number, step = start * 0.001): Array<{ d: number; p: number }> {
    return FORECAST_GRID_DAYS.map((d, i) => ({ d, p: Math.round((start + i * step) * 100) / 100 }));
  }

  interface RawCoin {
    coin: string;
    currentPrice: number;
    confidence: number;
    scenarioProbabilities: { bull: number; base: number; bear: number };
    reasoning: string[];
    bull: Array<{ d: number; p: number }>;
    base: Array<{ d: number; p: number }>;
    bear: Array<{ d: number; p: number }>;
  }

  function coin(symbol: string, overrides: Partial<RawCoin> = {}): RawCoin {
    const anchor = REFERENCE_PRICE[symbol] ?? 1_000;
    return {
      coin: symbol,
      currentPrice: anchor,
      confidence: 60,
      scenarioProbabilities: { bull: 33, base: 34, bear: 33 },
      reasoning: ['macro backdrop stable', 'flows positive'],
      bull: fullScenario(anchor * 1.02),
      base: fullScenario(anchor),
      bear: fullScenario(anchor * 0.98),
      ...overrides,
    };
  }

  const validPayload = (): unknown => ({
    model: 'claude-sonnet-4-6',
    projections: [coin('BTC'), coin('ETH'), coin('SOL')],
  });

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — a well-formed batch');
  // ---------------------------------------------------------------------------
  {
    const r = validateIngestBatch(validPayload(), references(), OPTIONS);
    check('ok', r.ok);
    check('all three coins accepted', r.accepted.length === 3);
    check('no rejections', r.rejections.length === 0);
    check('no skips', r.skipped.length === 0);
    check(
      'accepted rows carry source=routine and the reported model',
      r.accepted.every((p) => p.service === 'routine' && p.model === 'claude-sonnet-4-6'),
    );
    check(
      'accepted rows carry the batch asOf',
      r.accepted.every((p) => p.generatedAt === ASOF),
    );
    check(
      'probabilities normalised to 100',
      r.accepted.every((p) => {
        const s = p.scenarioProbabilities;
        return s.bull + s.base + s.bear === 100;
      }),
    );
    check(
      'scenarios snapped to the full grid',
      r.accepted.every(
        (p) =>
          p.bull.length === FORECAST_GRID_DAYS.length &&
          p.base.length === FORECAST_GRID_DAYS.length &&
          p.bear.length === FORECAST_GRID_DAYS.length,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — anchor 30% off the reference price');
  // ---------------------------------------------------------------------------
  {
    const payload = {
      model: 'm',
      projections: [
        coin('BTC', { currentPrice: REFERENCE_PRICE.BTC * 1.3 }),
        coin('ETH'),
        coin('SOL'),
      ],
    };
    const r = validateIngestBatch(payload, references(), OPTIONS);
    check('batch rejected', !r.ok);
    check(
      'rejection names the anchor check on BTC',
      r.rejections.some((x) => x.coin === 'BTC' && x.check === 'anchor'),
    );
    check('nothing accepted from a rejected batch', r.accepted.length === 0);
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — a two-point scenario cannot be snapped');
  // ---------------------------------------------------------------------------
  {
    const payload = {
      model: 'm',
      projections: [
        coin('BTC', {
          bull: [
            { d: 1, p: 100_000 },
            { d: 365, p: 120_000 },
          ],
        }),
        coin('ETH'),
        coin('SOL'),
      ],
    };
    const r = validateIngestBatch(payload, references(), OPTIONS);
    check('batch rejected', !r.ok);
    check(
      'rejection names the coverage check',
      r.rejections.some((x) => x.coin === 'BTC' && x.check === 'coverage'),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — probabilities all zero');
  // ---------------------------------------------------------------------------
  {
    const payload = {
      model: 'm',
      projections: [
        coin('BTC', { scenarioProbabilities: { bull: 0, base: 0, bear: 0 } }),
        coin('ETH'),
        coin('SOL'),
      ],
    };
    const r = validateIngestBatch(payload, references(), OPTIONS);
    check('batch rejected', !r.ok);
    check(
      'rejection names the probabilities check',
      r.rejections.some((x) => x.coin === 'BTC' && x.check === 'probabilities'),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — negative price rejects');
  // ---------------------------------------------------------------------------
  {
    const bad = fullScenario(REFERENCE_PRICE.BTC);
    bad[5] = { d: bad[5].d, p: -1 };
    const payload = {
      model: 'm',
      projections: [coin('BTC', { bull: bad }), coin('ETH'), coin('SOL')],
    };
    const r = validateIngestBatch(payload, references(), OPTIONS);
    check('batch rejected', !r.ok);
    check(
      'rejection names the positive-price check',
      r.rejections.some((x) => x.check === 'positive-price'),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — unknown coin is skipped, not rejected');
  // ---------------------------------------------------------------------------
  {
    const payload = {
      model: 'm',
      projections: [coin('BTC'), coin('ETH'), coin('SOL'), coin('DOGE', { currentPrice: 0.1 })],
    };
    const r = validateIngestBatch(payload, references(), OPTIONS);
    check('batch still ok', r.ok);
    check('three known coins accepted', r.accepted.length === 3);
    check(
      'DOGE reported as skipped (unknown-coin)',
      r.skipped.some((s) => s.coin === 'DOGE' && s.reason === 'unknown-coin'),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — no reference price fails closed at the anchor check');
  // ---------------------------------------------------------------------------
  {
    const r = validateIngestBatch(
      validPayload(),
      references({ SOL: { referencePrice: null, hasAsset: true } }),
      OPTIONS,
    );
    check('batch rejected', !r.ok);
    check(
      'SOL rejected at the anchor check for an unverifiable price',
      r.rejections.some((x) => x.coin === 'SOL' && x.check === 'anchor'),
    );
  }

  // ---------------------------------------------------------------------------
  section('validateIngestBatch — a coin with no assets row is skipped');
  // ---------------------------------------------------------------------------
  {
    const r = validateIngestBatch(
      validPayload(),
      references({ SOL: { referencePrice: REFERENCE_PRICE.SOL, hasAsset: false } }),
      OPTIONS,
    );
    check('batch still ok', r.ok);
    check('two coins accepted', r.accepted.length === 2);
    check(
      'SOL reported as skipped (no-asset-row)',
      r.skipped.some((s) => s.coin === 'SOL' && s.reason === 'no-asset-row'),
    );
  }

  // ---------------------------------------------------------------------------
  section('checkIngestAuth — credential handling');
  // ---------------------------------------------------------------------------
  {
    const url = 'https://example.com/api/projections/ingest';

    delete process.env.FORECAST_INGEST_SECRET;
    check('unset secret → unconfigured', checkIngestAuth(new Request(url)) === 'unconfigured');

    process.env.FORECAST_INGEST_SECRET = 'sekret-value';
    check('no header → unauthorized', checkIngestAuth(new Request(url)) === 'unauthorized');
    check(
      'wrong bearer → unauthorized',
      checkIngestAuth(new Request(url, { headers: { authorization: 'Bearer nope' } })) ===
        'unauthorized',
    );
    check(
      'cookie is not accepted (machine-to-machine only)',
      checkIngestAuth(new Request(url, { headers: { cookie: 'catoshi_admin=sekret-value' } })) ===
        'unauthorized',
    );
    check(
      'correct bearer → ok',
      checkIngestAuth(new Request(url, { headers: { authorization: 'Bearer sekret-value' } })) ===
        'ok',
    );
  }

  // ---------------------------------------------------------------------------
  section('runIngest — guard flow');
  // ---------------------------------------------------------------------------

  function stubDeps(over: Partial<IngestRunDeps> = {}): {
    deps: IngestRunDeps;
    calls: { persist: number; revalidate: number; recorded: CollectorOutcome[] };
  } {
    const calls = { persist: 0, revalidate: 0, recorded: [] as CollectorOutcome[] };
    const deps: IngestRunDeps = {
      getDailyCount: async () => 0,
      resolveContext: async () => ({
        references: references(),
        snapshotLinks: { BTC: 1, ETH: 2, SOL: 3 },
      }),
      persist: async (projections) => {
        calls.persist++;
        return {
          data: projections.map((_, i) => ({ id: i }) as unknown as StoredForecast),
          error: null,
        };
      },
      revalidate: () => {
        calls.revalidate++;
      },
      recordStatus: async (outcome) => {
        calls.recorded.push(outcome);
      },
      ...over,
    };
    return { deps, calls };
  }

  {
    const { deps, calls } = stubDeps();
    const res = await runIngest(validPayload(), deps);
    check('valid batch → 200', res.status === 200);
    check('persist called once', calls.persist === 1);
    check('cache revalidated after the write', calls.revalidate === 1);
    check('response reports the stored count', res.body.storedCount === 3);
    check(
      'accepted ingest recorded as a success',
      calls.recorded.length === 1 && calls.recorded[0].ok === true,
    );
  }

  {
    const { deps, calls } = stubDeps();
    const payload = {
      model: 'm',
      projections: [
        coin('BTC', { currentPrice: REFERENCE_PRICE.BTC * 1.3 }),
        coin('ETH'),
        coin('SOL'),
      ],
    };
    const res = await runIngest(payload, deps);
    check('rejected batch → 422', res.status === 422);
    check('persist NOT called on a rejected batch', calls.persist === 0);
    check('cache NOT touched on a rejected batch', calls.revalidate === 0);
    check(
      'rejected ingest recorded as a failure with the check name',
      calls.recorded.length === 1 &&
        calls.recorded[0].ok === false &&
        (calls.recorded[0].error ?? '').includes('BTC:anchor'),
    );
  }

  {
    const { deps, calls } = stubDeps({ getDailyCount: async () => FORECAST_DAILY_INGEST_LIMIT });
    const res = await runIngest(validPayload(), deps);
    check('at the daily ceiling → 429', res.status === 429);
    check('persist NOT called past the ceiling', calls.persist === 0);
    check('cache NOT touched past the ceiling', calls.revalidate === 0);
  }

  {
    const { deps, calls } = stubDeps({ getDailyCount: async () => null });
    const res = await runIngest(validPayload(), deps);
    check('unreadable daily count → 503 (fail closed)', res.status === 503);
    check('persist NOT called when the count is unreadable', calls.persist === 0);
  }

  {
    const { deps, calls } = stubDeps();
    const res = await runIngest(
      { model: 'm', projections: [coin('DOGE', { currentPrice: 0.1 })] },
      deps,
    );
    check('all-unknown batch → 422 (nothing ingestable)', res.status === 422);
    check('persist NOT called when nothing is ingestable', calls.persist === 0);
  }

  {
    const { deps, calls } = stubDeps({ getDailyCount: async () => FORECAST_DAILY_INGEST_LIMIT });
    await runIngest(validPayload(), deps);
    check(
      'a ceiling hit is recorded as a failure, not a success',
      calls.recorded.length === 1 && calls.recorded[0].ok === false,
    );
  }

  // ---------------------------------------------------------------------------
  section('forecastIngestState — /api/health state derivation');
  // ---------------------------------------------------------------------------
  {
    const NOW = new Date('2026-09-06T12:00:00.000Z').getTime();
    const minsAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString();
    const lateSeconds = SCHEDULED_FORECAST_LATE_AFTER_SECONDS;

    check('no row → never-run', forecastIngestState(null, NOW) === 'never-run');
    check(
      'fresh accepted, no error → healthy',
      forecastIngestState(
        { lastSuccessAt: minsAgo(30), lastAttemptAt: minsAgo(30), lastError: null },
        NOW,
      ) === 'healthy',
    );
    check(
      `accepted older than the late threshold → late`,
      forecastIngestState(
        {
          lastSuccessAt: new Date(NOW - (lateSeconds + 60) * 1000).toISOString(),
          lastAttemptAt: minsAgo(1),
          lastError: null,
        },
        NOW,
      ) === 'late',
    );
    check(
      'most recent attempt rejected → failing',
      forecastIngestState(
        { lastSuccessAt: minsAgo(20), lastAttemptAt: minsAgo(1), lastError: 'BTC:anchor' },
        NOW,
      ) === 'failing',
    );
    check(
      'REJECTED INGEST NEVER READS AS HEALTHY (even with a recent prior success)',
      forecastIngestState(
        { lastSuccessAt: minsAgo(2), lastAttemptAt: minsAgo(1), lastError: 'BTC:coverage' },
        NOW,
      ) !== 'healthy',
    );
    check(
      'attempts but never an accepted ingest → never-run',
      forecastIngestState(
        { lastSuccessAt: null, lastAttemptAt: minsAgo(5), lastError: null },
        NOW,
      ) === 'never-run',
    );
  }

  // ---------------------------------------------------------------------------
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks`);
  process.exit(failures === 0 ? 0 : 1);
})();
