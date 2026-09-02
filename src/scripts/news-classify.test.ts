/**
 * Classification tests for spec 015, Slice 4 (technical-considerations §4).
 *
 * Run:  npx tsx src/scripts/news-classify.test.ts
 *
 * No real network, no real database. Pure helpers (`validateClassification`,
 * `isCadenceElapsed`, `computeModelCostUsd`) are tested directly; the
 * `classifyNews` orchestration is tested with a mocked Anthropic client and
 * in-memory DB seams injected through its dependency bag. Exits non-zero on
 * failure (pattern: src/scripts/signal-rules.test.ts).
 */

import type Anthropic from '@anthropic-ai/sdk';

import type { ClassificationInsert } from '@/lib/db/news';
import type { ClassifyNewsDeps, PendingNewsItem, RawClassification } from '@/lib/news/classify';

// A DATABASE_URL must exist before `@/lib/db/client` is imported (it builds a
// `pg.Pool` at module load). The value is never connected to — every DB path is
// stubbed via `classifyNews` deps — so a placeholder is fine.
process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';

// tsx transforms this file to CJS, which forbids top-level await — wrap the
// dynamic imports (needed so the env vars above are set before `@/lib/db/client`
// builds its Pool) and the whole suite in one async IIFE.
void (async () => {
  const {
    NEWS_CLASSIFY_INTERVAL_HOURS,
    NEWS_CLASSIFY_MODEL,
    NEWS_HORIZON_HOURS_MAX,
    NEWS_HORIZON_HOURS_MIN,
    NEWS_PROMPT_VERSION,
  } = await import('@/consts/news');
  const { computeModelCostUsd } = await import('@/consts/forecastPricing');
  const { NEWS_CLASSIFICATION_INSERT_SQL } = await import('@/lib/db/news');
  const { classifyNews, isCadenceElapsed, validateClassification } =
    await import('@/lib/news/classify');

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

  const TRACKED = ['BTC', 'ETH', 'SOL'];
  const HOUR_MS = 3_600_000;
  const NOW = new Date('2026-09-02T12:00:00.000Z');

  /** A well-formed raw entry; overrides poke one field out of range. */
  function rawEntry(overrides: Partial<RawClassification> = {}): RawClassification {
    return {
      id: '1',
      scope: 'market',
      direction: 'BULLISH',
      magnitude: 'MEDIUM',
      horizon_hours: 48,
      confidence: 0.5,
      rationale: 'CPI print of 3.1% came in above the 2.9% consensus.',
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  section('validateClassification — accepts well-formed input');
  // ---------------------------------------------------------------------------

  {
    const market = validateClassification(rawEntry(), TRACKED);
    check('market scope validates', market.ok);
    check(
      'market scope carries no asset symbol',
      market.ok && market.value.scope === 'market' && market.value.assetSymbol === null,
    );

    const btc = validateClassification(rawEntry({ scope: 'BTC' }), TRACKED);
    check('BTC scope validates', btc.ok);
    check(
      'BTC scope carries the symbol for asset-id resolution',
      btc.ok && btc.value.scope === 'BTC' && btc.value.assetSymbol === 'BTC',
    );

    const lower = validateClassification(
      rawEntry({ scope: 'eth', direction: 'bearish', magnitude: 'high' }),
      TRACKED,
    );
    check(
      'case-insensitive scope/direction/magnitude normalise',
      lower.ok &&
        lower.value.scope === 'ETH' &&
        lower.value.direction === 'BEARISH' &&
        lower.value.magnitude === 'HIGH',
    );

    check(
      'NEUTRAL is a valid direction',
      validateClassification(rawEntry({ direction: 'NEUTRAL' }), TRACKED).ok,
    );
    check(
      `horizon exactly MIN (${NEWS_HORIZON_HOURS_MIN}) validates`,
      validateClassification(rawEntry({ horizon_hours: NEWS_HORIZON_HOURS_MIN }), TRACKED).ok,
    );
    check(
      `horizon exactly MAX (${NEWS_HORIZON_HOURS_MAX}) validates`,
      validateClassification(rawEntry({ horizon_hours: NEWS_HORIZON_HOURS_MAX }), TRACKED).ok,
    );
    check(
      'confidence exactly 0 validates',
      validateClassification(rawEntry({ confidence: 0 }), TRACKED).ok,
    );
    check(
      'confidence exactly 1 validates',
      validateClassification(rawEntry({ confidence: 1 }), TRACKED).ok,
    );
  }

  // ---------------------------------------------------------------------------
  section('validateClassification — every rejection is a dropped row');
  // ---------------------------------------------------------------------------

  const REJECTIONS: Array<[string, RawClassification]> = [
    ['untracked symbol scope (DOGE)', rawEntry({ scope: 'DOGE' })],
    ["explicit 'drop' scope", rawEntry({ scope: 'drop' })],
    ['empty scope', rawEntry({ scope: '' })],
    ['direction out of enum', rawEntry({ direction: 'SIDEWAYS' })],
    ['magnitude out of enum', rawEntry({ magnitude: 'HUGE' })],
    ['horizon below MIN', rawEntry({ horizon_hours: NEWS_HORIZON_HOURS_MIN - 1 })],
    ['horizon above MAX', rawEntry({ horizon_hours: NEWS_HORIZON_HOURS_MAX + 1 })],
    ['horizon non-numeric', rawEntry({ horizon_hours: 'soon' })],
    ['confidence < 0', rawEntry({ confidence: -0.01 })],
    ['confidence > 1', rawEntry({ confidence: 1.5 })],
    ['confidence non-numeric', rawEntry({ confidence: 'high' })],
    ['missing rationale', rawEntry({ rationale: '   ' })],
  ];

  for (const [label, raw] of REJECTIONS) {
    const result = validateClassification(raw, TRACKED);
    check(`rejected: ${label}`, !result.ok, result.ok ? 'unexpectedly validated' : '');
  }

  // ---------------------------------------------------------------------------
  section('isCadenceElapsed');
  // ---------------------------------------------------------------------------

  check('null last-run always runs', isCadenceElapsed(null, NOW) === true);
  check(
    'within the interval → no run',
    isCadenceElapsed(
      new Date(NOW.getTime() - (NEWS_CLASSIFY_INTERVAL_HOURS - 1) * HOUR_MS),
      NOW,
    ) === false,
  );
  check(
    'older than the interval → runs',
    isCadenceElapsed(
      new Date(NOW.getTime() - (NEWS_CLASSIFY_INTERVAL_HOURS + 1) * HOUR_MS),
      NOW,
    ) === true,
  );
  check(
    'exactly the interval → runs',
    isCadenceElapsed(new Date(NOW.getTime() - NEWS_CLASSIFY_INTERVAL_HOURS * HOUR_MS), NOW) ===
      true,
  );

  // ---------------------------------------------------------------------------
  section('computeModelCostUsd for NEWS_CLASSIFY_MODEL');
  // ---------------------------------------------------------------------------

  {
    // Haiku pricing: $1 / 1M input, $5 / 1M output.
    const cost = computeModelCostUsd(NEWS_CLASSIFY_MODEL, 1_000_000, 1_000_000);
    check('1M in + 1M out = $6.00', cost === 6, `got ${cost}`);
    const small = computeModelCostUsd(NEWS_CLASSIFY_MODEL, 4000, 800);
    check(
      '4000 in + 800 out = $0.008',
      small === Math.round((0.004 + 0.004) * 1e6) / 1e6,
      `got ${small}`,
    );
    check('unknown model → null', computeModelCostUsd('no-such-model', 100, 100) === null);
  }

  // ---------------------------------------------------------------------------
  section('NEWS_CLASSIFICATION_INSERT_SQL — re-classification inserts, never overwrites');
  // ---------------------------------------------------------------------------

  {
    const sql = NEWS_CLASSIFICATION_INSERT_SQL.toLowerCase();
    check(
      'conflict target is (news_item_id, prompt_version)',
      sql.includes('on conflict (news_item_id, prompt_version)'),
    );
    check(
      'conflict action is DO NOTHING, not DO UPDATE',
      sql.includes('do nothing') && !sql.includes('do update'),
    );
  }

  // ---------------------------------------------------------------------------
  section('classifyNews orchestration (mocked client + DB seams)');
  // ---------------------------------------------------------------------------

  interface PersistCall {
    inserts: ClassificationInsert[];
    terminalItemIds: number[];
  }

  function toolResponse(
    classifications: unknown[],
    usage: { input_tokens: number; output_tokens: number } = {
      input_tokens: 200,
      output_tokens: 90,
    },
  ): Anthropic.Message {
    return {
      content: [{ type: 'tool_use', id: 't1', name: 'classify_news', input: { classifications } }],
      usage,
    } as unknown as Anthropic.Message;
  }

  interface DepsCtx {
    deps: ClassifyNewsDeps;
    persistCalls: PersistCall[];
    counters: { pendingLoads: number };
  }

  function baseDeps(overrides: Partial<ClassifyNewsDeps> = {}): DepsCtx {
    const persistCalls: PersistCall[] = [];
    const counters = { pendingLoads: 0 };
    const items: PendingNewsItem[] = [
      {
        id: 101,
        title: 'US CPI print above consensus',
        source: 'coindesk',
        publishedAt: '2026-09-02T06:00:00.000Z',
      },
      {
        id: 102,
        title: 'Ethereum foundation ships client update',
        source: 'decrypt',
        publishedAt: '2026-09-02T07:00:00.000Z',
      },
    ];
    const deps: ClassifyNewsDeps = {
      now: NOW,
      loadLastRunAt: async () => new Date(NOW.getTime() - 24 * HOUR_MS),
      loadPendingItems: async () => {
        counters.pendingLoads += 1;
        return items;
      },
      loadAssetIdMap: async () => ({ BTC: 1, ETH: 2, SOL: 3 }),
      persist: async (inserts, terminalItemIds) => {
        persistCalls.push({
          inserts: [...inserts] as ClassificationInsert[],
          terminalItemIds: [...terminalItemIds],
        });
      },
      ...overrides,
    };
    return { deps, persistCalls, counters };
  }

  // -- cadence gate: within the interval is a no-op ----------------------------
  {
    const ctx = baseDeps({ loadLastRunAt: async () => new Date(NOW.getTime() - 1 * HOUR_MS) });
    let clientCalled = false;
    const result = await classifyNews({
      ...ctx.deps,
      client: {
        messages: {
          create: async () => {
            clientCalled = true;
            return toolResponse([]);
          },
        },
      } as unknown as Anthropic,
    });
    check('cadence gate: no model call within the interval', clientCalled === false);
    check('cadence gate: no persist within the interval', ctx.persistCalls.length === 0);
    check('cadence gate: no work list loaded within the interval', ctx.counters.pendingLoads === 0);
    check(
      'cadence gate: ok status, nothing classified',
      result.classified === 0 && result.sources[0]?.ok === true,
    );
  }

  // -- older last run: runs, market → null, BTC → resolved id -----------------
  {
    const ctx = baseDeps();
    const result = await classifyNews({
      ...ctx.deps,
      client: {
        messages: {
          create: async () =>
            toolResponse([
              {
                id: '101',
                scope: 'market',
                direction: 'BEARISH',
                magnitude: 'HIGH',
                horizon_hours: 168,
                confidence: 0.7,
                rationale: 'CPI came in at 3.1%, above the 2.9% consensus.',
              },
              {
                id: '102',
                scope: 'ETH',
                direction: 'BULLISH',
                magnitude: 'LOW',
                horizon_hours: 72,
                confidence: 0.4,
                rationale: 'Ethereum client update shipped on schedule.',
              },
            ]),
        },
      } as unknown as Anthropic,
    });

    check('runs when last run is old', ctx.persistCalls.length === 1);
    const call = ctx.persistCalls[0];
    check('both valid rows persisted', call?.inserts.length === 2, `got ${call?.inserts.length}`);
    const market = call?.inserts.find((r) => r.scope === 'market');
    const eth = call?.inserts.find((r) => r.scope === 'ETH');
    check('market row has asset_id null', market?.assetId === null);
    check('ETH row resolves asset_id 2', eth?.assetId === 2, `got ${eth?.assetId}`);
    check(
      'both items marked terminal',
      JSON.stringify(call?.terminalItemIds) === JSON.stringify([101, 102]),
    );
    check(
      'every row carries NEWS_PROMPT_VERSION',
      call?.inserts.every((r) => r.promptVersion === NEWS_PROMPT_VERSION) === true,
    );
    check(
      'every row carries the classify model',
      call?.inserts.every((r) => r.model === NEWS_CLASSIFY_MODEL) === true,
    );
    check(
      'measured cost is on every row',
      call?.inserts.every((r) => typeof r.costUsd === 'number' && r.costUsd! > 0) === true,
    );
    check(
      'result counts: 2 classified, 0 dropped',
      result.classified === 2 && result.dropped === 0,
    );
    check('ok status appended', result.sources.at(-1)?.ok === true);
  }

  // -- a malformed entry is dropped, the item is still terminal ---------------
  {
    const ctx = baseDeps();
    const result = await classifyNews({
      ...ctx.deps,
      client: {
        messages: {
          create: async () =>
            toolResponse([
              {
                id: '101',
                scope: 'market',
                direction: 'BEARISH',
                magnitude: 'HIGH',
                horizon_hours: 168,
                confidence: 0.7,
                rationale: 'CPI came in hot at 3.1%.',
              },
              {
                id: '102',
                scope: 'ETH',
                direction: 'SIDEWAYS',
                magnitude: 'LOW',
                horizon_hours: 72,
                confidence: 0.4,
                rationale: 'bad direction.',
              },
            ]),
        },
      } as unknown as Anthropic,
    });
    const call = ctx.persistCalls[0];
    check(
      'only the valid row is persisted',
      call?.inserts.length === 1 && call.inserts[0].newsItemId === 101,
    );
    check(
      'the malformed item is still marked terminal (not retried forever)',
      JSON.stringify(call?.terminalItemIds) === JSON.stringify([101, 102]),
    );
    check(
      'result counts: 1 classified, 1 dropped',
      result.classified === 1 && result.dropped === 1,
    );
  }

  // -- an item omitted by the model is dropped, still terminal ---------------
  {
    const ctx = baseDeps();
    const result = await classifyNews({
      ...ctx.deps,
      client: {
        messages: {
          create: async () =>
            toolResponse([
              {
                id: '101',
                scope: 'market',
                direction: 'NEUTRAL',
                magnitude: 'LOW',
                horizon_hours: 24,
                confidence: 0.2,
                rationale: 'Routine CPI recap, no surprise vs consensus.',
              },
            ]),
        },
      } as unknown as Anthropic,
    });
    const call = ctx.persistCalls[0];
    check('omitted item not persisted', call?.inserts.length === 1);
    check(
      'omitted item still terminal',
      JSON.stringify(call?.terminalItemIds) === JSON.stringify([101, 102]),
    );
    check(
      'result: 1 classified, 1 dropped (the omission)',
      result.classified === 1 && result.dropped === 1,
    );
  }

  // -- API failure: writes nothing, ok:false, does not throw -----------------
  {
    const ctx = baseDeps();
    let threw = false;
    let result;
    try {
      result = await classifyNews({
        ...ctx.deps,
        client: {
          messages: {
            create: async () => {
              throw new Error('anthropic 529 overloaded');
            },
          },
        } as unknown as Anthropic,
      });
    } catch {
      threw = true;
    }
    check('API failure does not throw', threw === false);
    check('API failure persists nothing', ctx.persistCalls.length === 0);
    check(
      'API failure surfaces ok:false in source status',
      result?.sources.some((s) => s.ok === false && s.source === 'news:classify') === true,
    );
    check('API failure classifies nothing', result?.classified === 0);
  }

  // -- transaction failure: propagates as ok:false, nothing counted ----------
  {
    const ctx = baseDeps({
      persist: async () => {
        throw new Error('deadlock detected');
      },
    });
    const result = await classifyNews({
      ...ctx.deps,
      client: {
        messages: {
          create: async () =>
            toolResponse([
              {
                id: '101',
                scope: 'market',
                direction: 'NEUTRAL',
                magnitude: 'LOW',
                horizon_hours: 24,
                confidence: 0.2,
                rationale: 'Routine recap.',
              },
            ]),
        },
      } as unknown as Anthropic,
    });
    check(
      'transaction failure → ok:false status',
      result.sources.some((s) => s.ok === false),
    );
    check('transaction failure → classified 0', result.classified === 0);
  }

  // -- mock mode: no client, no DB, no-op -----------------------------------
  {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true';
    const ctx = baseDeps();
    let clientCalled = false;
    const result = await classifyNews({
      ...ctx.deps,
      loadLastRunAt: async () => {
        throw new Error('DB must not be touched in mock mode');
      },
      client: {
        messages: {
          create: async () => {
            clientCalled = true;
            return toolResponse([]);
          },
        },
      } as unknown as Anthropic,
    });
    check('mock mode: no model call', clientCalled === false);
    check('mock mode: no persist', ctx.persistCalls.length === 0);
    check(
      'mock mode: ok status, 0 classified',
      result.classified === 0 && result.sources[0]?.ok === true,
    );
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
  }

  // ---------------------------------------------------------------------------

  console.log(
    failures === 0
      ? `\nAll ${checks} checks passed.\n`
      : `\n${failures} of ${checks} checks FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
