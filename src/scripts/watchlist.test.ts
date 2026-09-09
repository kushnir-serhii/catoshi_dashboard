/**
 * Tests for the `?ids=` helpers behind `GET /api/markets` (spec 021,
 * technical-considerations §2.1, §4).
 *
 * Run:  npx tsx src/scripts/watchlist.test.ts
 *
 * No database, no network, no server, no test runner — `parseMarketIds` and
 * `orderByRequestedIds` are pure. Follows the `src/scripts/scoring.test.ts`
 * pattern: a `check(name, ok)` harness counting failures, `section` headers,
 * and a non-zero exit on failure.
 */

import { orderByRequestedIds, parseMarketIds } from '@/app/api/markets/marketIds';
import { WATCHLIST_MAX_COINS, WATCHLIST_STORAGE_VERSION } from '@/consts/prices';
import { PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import type { MarketListItem, ProjectionData } from '@/data/types';
import {
  addCoin,
  defaultWatchlist,
  parseStored,
  removeCoin,
  type WatchlistCoin,
} from '@/hooks/useWatchlist';
import { summariseProjection } from '@/lib/projectionSummary';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

function okIds(raw: string): string[] {
  const result = parseMarketIds(raw);
  if (!result.ok) throw new Error(`expected ok for ${JSON.stringify(raw)}: ${result.error}`);
  return result.ids;
}

function row(id: string): MarketListItem {
  return {
    id,
    symbol: id.slice(0, 3),
    name: id,
    image: '',
    current_price: 1,
    price_change_percentage_24h: 0,
    market_cap: 0,
    total_volume: 0,
    sparkline_in_7d: { price: [] },
  };
}

// ---------------------------------------------------------------------------
section('parseMarketIds — normalisation');
// ---------------------------------------------------------------------------

{
  check(
    'trims surrounding whitespace',
    okIds(' bitcoin , ethereum ').join(',') === 'bitcoin,ethereum',
  );
  check('lowercases', okIds('Bitcoin,ETHEREUM,SoLaNa').join(',') === 'bitcoin,ethereum,solana');
  check(
    'de-duplicates, first occurrence order preserved',
    okIds('bitcoin,ethereum,bitcoin,BITCOIN').join(',') === 'bitcoin,ethereum',
  );
  check('drops empty segments', okIds('bitcoin,,ethereum, ,').join(',') === 'bitcoin,ethereum');
  check('an all-empty string yields no ids', okIds('   ,  , ').length === 0);
  check(
    'preserves requested order',
    okIds('solana,bitcoin,ethereum').join(',') === 'solana,bitcoin,ethereum',
  );
}

// ---------------------------------------------------------------------------
section('parseMarketIds — over-limit rejection');
// ---------------------------------------------------------------------------

{
  const atLimit = Array.from({ length: WATCHLIST_MAX_COINS }, (_, i) => `coin-${i}`).join(',');
  check('exactly WATCHLIST_MAX_COINS ids is accepted', parseMarketIds(atLimit).ok);

  const overLimit = Array.from({ length: WATCHLIST_MAX_COINS + 1 }, (_, i) => `coin-${i}`).join(
    ',',
  );
  const result = parseMarketIds(overLimit);
  check('WATCHLIST_MAX_COINS + 1 ids is rejected', result.ok === false);
  check(
    'rejection carries an error string, not ids',
    result.ok === false && typeof result.error === 'string' && result.error.length > 0,
  );

  // Duplicates and empties are removed BEFORE the cap is applied.
  const dupesUnderCap = `${atLimit},coin-0,coin-1,,`;
  check('duplicates past the cap do not trip the limit', parseMarketIds(dupesUnderCap).ok);
}

// ---------------------------------------------------------------------------
section('orderByRequestedIds — order preserved, missing ids absent');
// ---------------------------------------------------------------------------

{
  const upstream = [row('ethereum'), row('bitcoin'), row('solana')];

  check(
    'response is re-ordered to the requested id order',
    orderByRequestedIds(upstream, ['solana', 'bitcoin', 'ethereum'])
      .map((r) => r.id)
      .join(',') === 'solana,bitcoin,ethereum',
  );

  const withMissing = orderByRequestedIds(upstream, ['bitcoin', 'dogecoin', 'ethereum']);
  check(
    'a requested id missing upstream is absent',
    withMissing.map((r) => r.id).join(',') === 'bitcoin,ethereum',
  );
  check('no zero-filled placeholder row is synthesised', withMissing.length === 2);
  check(
    'every returned row is a real upstream row',
    withMissing.every((r) => r.current_price === 1),
  );

  check(
    'a row not requested is dropped',
    orderByRequestedIds(upstream, ['bitcoin'])
      .map((r) => r.id)
      .join(',') === 'bitcoin',
  );

  check('empty requested list yields no rows', orderByRequestedIds(upstream, []).length === 0);
  check('empty upstream yields no rows', orderByRequestedIds([], ['bitcoin']).length === 0);
}

// ---------------------------------------------------------------------------
section('summariseProjection — spec 021 §2.4');
// ---------------------------------------------------------------------------

{
  function projection(overrides: Partial<ProjectionData>): ProjectionData {
    return {
      coin: 'BTC',
      bull: [
        { d: 0, p: 100 },
        { d: 60, p: 160 },
      ],
      base: [
        { d: 0, p: 100 },
        { d: 60, p: 130 },
      ],
      bear: [
        { d: 0, p: 100 },
        { d: 60, p: 80 },
      ],
      currentPrice: 100,
      generatedAt: '2026-01-01T00:00:00.000Z',
      confidence: 42,
      scenarioProbabilities: { bull: 30, base: 50, bear: 20 },
      reasoning: ['fixture'],
      service: 'openai',
      model: 'gpt-4o-mini',
      schemaVersion: PROJECTION_SCHEMA_VERSION,
      ...overrides,
    };
  }

  check('null for a missing projection', summariseProjection(null, 60) === null);
  check(
    'null when currentPrice is zero',
    summariseProjection(projection({ currentPrice: 0 }), 60) === null,
  );
  check(
    'null when currentPrice is negative',
    summariseProjection(projection({ currentPrice: -5 }), 60) === null,
  );

  const summary = summariseProjection(projection({}), 60);
  check(
    'base curve 100 → 130 at day 60 is +30%',
    summary !== null && near(summary.deltaPct, 30),
    JSON.stringify(summary),
  );
  check('confidence is passed through unchanged', summary !== null && summary.confidence === 42);

  // Linear interpolation between grid points: day 30 is halfway 100 → 130.
  const halfway = summariseProjection(projection({}), 30);
  check(
    'day 30 interpolates to +15%',
    halfway !== null && near(halfway.deltaPct, 15),
    JSON.stringify(halfway),
  );
}

// ---------------------------------------------------------------------------
section('useWatchlist reducers — spec 021 §2.3');
// ---------------------------------------------------------------------------

{
  const coin = (n: number): WatchlistCoin => ({
    id: `coin-${n}`,
    symbol: `C${n}`,
    name: `Coin ${n}`,
  });

  // add
  {
    const input = [coin(1)];
    const next = addCoin(input, coin(2));
    check('addCoin appends a new coin', next.map((c) => c.id).join(',') === 'coin-1,coin-2');
    check('addCoin does not mutate the input', input.length === 1);
  }

  // remove
  {
    const next = removeCoin([coin(1), coin(2), coin(3)], 'coin-2');
    check('removeCoin drops the matching id', next.map((c) => c.id).join(',') === 'coin-1,coin-3');
    check('removeCoin of an absent id is a no-op', removeCoin([coin(1)], 'nope').length === 1);
  }

  // duplicate no-op
  {
    const start = [coin(1), coin(2)];
    const next = addCoin(start, coin(1));
    check('addCoin on a duplicate id keeps the list length', next.length === 2);
    check(
      'addCoin on a duplicate id keeps the same ids',
      next.map((c) => c.id).join(',') === 'coin-1,coin-2',
    );
  }

  // cap
  {
    const full = Array.from({ length: WATCHLIST_MAX_COINS }, (_, i) => coin(i + 1));
    const next = addCoin(full, coin(999));
    check('addCoin at the cap is a no-op', next.length === WATCHLIST_MAX_COINS);
    check('addCoin at the cap does not add the new id', !next.some((c) => c.id === 'coin-999'));
  }

  // parseStored — happy path
  {
    const stored = JSON.stringify({
      v: WATCHLIST_STORAGE_VERSION,
      coins: [coin(1), coin(2)],
    });
    check(
      'parseStored round-trips a valid payload',
      parseStored(stored)
        .map((c) => c.id)
        .join(',') === 'coin-1,coin-2',
    );
  }

  // parseStored — recovery
  {
    const fallback = defaultWatchlist()
      .map((c) => c.id)
      .join(',');
    check(
      'parseStored(null) falls back to the default list',
      parseStored(null)
        .map((c) => c.id)
        .join(',') === fallback,
    );
    check(
      'parseStored of a corrupt string falls back to the default list',
      parseStored('}{ not json')
        .map((c) => c.id)
        .join(',') === fallback,
    );
    const versionMismatch = JSON.stringify({
      v: WATCHLIST_STORAGE_VERSION + 1,
      coins: [coin(1)],
    });
    check(
      'parseStored of a version-mismatched payload falls back to the default list',
      parseStored(versionMismatch)
        .map((c) => c.id)
        .join(',') === fallback,
    );
    check('the default list is non-empty', defaultWatchlist().length > 0);
  }
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
