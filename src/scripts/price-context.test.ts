/**
 * Tests for the forecast price-anchor fix (src/lib/forecast/priceContext.ts).
 *
 * Run:  npx tsx src/scripts/price-context.test.ts
 *
 * No database, no network, no test runner — the helpers are pure. Follows the
 * `src/scripts/scoring.test.ts` pattern: a `check(name, ok)` harness counting
 * failures, `section` headers, and a non-zero exit on failure.
 *
 * The regression under test: the forecast prompt used to send only the *count*
 * of historical data points, so the model invented `currentPrice` from training
 * data. `isAnchorRatioSane` then rejected the projection and the chart drew no
 * bull/base/bear lines at all.
 */

import type { ForecastTarget } from '@/consts/projections';
import type { ForecastPoint } from '@/data/types';
import {
  ANCHOR_REBASE_TOLERANCE,
  buildPriceContext,
  lastKnownPrice,
  rebaseToMarketPrice,
} from '@/lib/forecast/priceContext';
import type { MarketData } from '@/lib/marketData';
import { isAnchorRatioSane } from '@/lib/projectionSeries';

let failures = 0;

function check(name: string, ok: boolean): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

const TARGETS: ForecastTarget[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
];

/** 90 daily closes rising from 60,000 to ~81,300 — the shape in the bug report. */
const BTC_HISTORY = Array.from({ length: 90 }, (_, i) => 60_000 + i * 239.33);

const MARKET_DATA: MarketData = {
  news: 'n/a',
  fearGreed: 'n/a',
  trending: 'n/a',
  reddit: 'n/a',
  historicalPrices: { bitcoin: BTC_HISTORY, ethereum: [] },
};

function curve(start: number, dailyDrift: number): ForecastPoint[] {
  return [1, 7, 14, 30].map((d) => ({
    d,
    p: Math.round(start * (1 + dailyDrift) ** d * 100) / 100,
  }));
}

section('lastKnownPrice');
check('returns the latest daily close', lastKnownPrice(MARKET_DATA, 'bitcoin') === BTC_HISTORY[89]);
check('undefined for an empty series', lastKnownPrice(MARKET_DATA, 'ethereum') === undefined);
check('undefined for an unknown coin id', lastKnownPrice(MARKET_DATA, 'dogecoin') === undefined);

section('buildPriceContext');
const context = buildPriceContext(MARKET_DATA, TARGETS);
check(
  'quotes the real current price, not a data-point count',
  context.includes('CURRENT PRICE: $81,300.37'),
);
check('does not fall back to the old "N entries" line', !context.includes('data points:'));
check('reports the 90-day range', context.includes('90-day range: $60,000.00 – $81,300.37'));
check('lists recent daily closes', context.includes('Last 14 daily closes'));
check('reports directional change', context.includes('90d +35.5%'));
check(
  'flags a coin whose history is unavailable instead of dropping it',
  context.includes('Ethereum (ETH): price history unavailable'),
);

section('rebaseToMarketPrice — the safety net');
// A stale anchor of the kind gpt-4o-mini produced when the prompt carried no
// prices at all: a BTC level remembered from training data, more than 2x below
// the live price, which is exactly what isAnchorRatioSane refuses to anchor.
const stale = {
  currentPrice: 35_000,
  bull: curve(35_000, 0.006),
  base: curve(35_000, 0.002),
  bear: curve(35_000, -0.004),
};
const market = 81_300.37;
const rebased = rebaseToMarketPrice(stale, market);

check('adopts the real market price as the anchor', rebased.currentPrice === market);
check(
  'day-1 base lands within a few percent of the market price',
  Math.abs(rebased.base[0].p / market - 1) < 0.05,
);
check(
  'preserves the scenario shape (relative trajectory unchanged, modulo cent rounding)',
  Math.abs(rebased.base[3].p / rebased.base[0].p - stale.base[3].p / stale.base[0].p) < 1e-5,
);
check(
  'keeps bull above base above bear',
  rebased.bull[3].p > rebased.base[3].p && rebased.base[3].p > rebased.bear[3].p,
);
check(
  'REGRESSION: the stale anchor was rejected by isAnchorRatioSane before rebasing',
  !isAnchorRatioSane(stale.currentPrice, market),
);
check(
  'REGRESSION: the rebased anchor is accepted, so the chart draws the lines',
  isAnchorRatioSane(rebased.currentPrice, market),
);

section('rebaseToMarketPrice — no-ops');
const onScale = {
  currentPrice: 81_000,
  bull: curve(81_000, 0.006),
  base: curve(81_000, 0.002),
  bear: curve(81_000, -0.004),
};
check(
  'leaves a projection already within tolerance untouched',
  rebaseToMarketPrice(onScale, 81_000 * (1 + ANCHOR_REBASE_TOLERANCE / 2)) === onScale,
);
check(
  'no market price to rebase onto → untouched',
  rebaseToMarketPrice(stale, undefined) === stale,
);
check('non-finite market price → untouched', rebaseToMarketPrice(stale, Number.NaN) === stale);
check('zero market price → untouched', rebaseToMarketPrice(stale, 0) === stale);
const noAnchor = {
  currentPrice: 0,
  bull: curve(100, 0.01),
  base: curve(100, 0),
  bear: curve(100, -0.01),
};
const adopted = rebaseToMarketPrice(noAnchor, market);
check(
  'unusable model anchor → adopts the market price without rescaling the curves',
  adopted.currentPrice === market && adopted.base[0].p === noAnchor.base[0].p,
);

console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
