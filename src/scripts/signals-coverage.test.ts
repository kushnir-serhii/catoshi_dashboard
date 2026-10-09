/**
 * Acceptance tests for spec 027 market-state coverage (functional-spec 2.3, 2.4;
 * technical-considerations 4).
 *
 * Run:  npx tsx src/scripts/signals-coverage.test.ts
 *
 * @spec: 027-market-pulse
 *
 * Pure functions only: no database, no network. Covers the new/changed rules
 * (`etf_streak`, `long_flush`, `short_squeeze`, `price_velocity`, `range_break`,
 * `rsi_1h_extreme`), the previous-snapshot gap guard, null discipline, and the
 * three FRED macro rules (weekly-batch lag, per-series max age, "as of" text).
 *
 * `@regression` marks checks that pin a behaviour the 2026-10-07 incident or a
 * review correction depends on (decisions.md: gap 45-90 min; max age DGS10 4d,
 * DCOILBRENTEU 10d, DTWEXBGS 12d; macro since_ts = observation date; etf_streak
 * at 3 days or +-$100M in a day).
 *
 * The 2026-10-07 replay uses `fixtures/027-eth-2026-10-07.json`, a read-only
 * extract of real ETH snapshots (01:00Z and the 02:00Z drop hour). ETF fields are
 * null there (not stored before 2026-10-09), so `etf_streak` is checked on the same
 * snapshot with the public 10-06 ETF figures injected.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MACRO_MAX_AGE_DAYS, MACRO_THRESHOLDS } from '@/consts/macro';
import {
  PRICE_VELOCITY_PCT,
  RANGE_BREAK_BUFFER_PCT,
  RANGE_BREAK_LOOKBACK_CANDLES,
  RSI_1H_EXTREME_SEVERITY,
  SIGNALS_PREV_GAP_MAX_MINUTES,
  SIGNALS_PREV_GAP_MIN_MINUTES,
} from '@/consts/signals';
import type { MarketSnapshot } from '@/data/types';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import { macro10y } from '@/lib/signals/macro/macro_10y';
import { macroBrent } from '@/lib/signals/macro/macro_brent';
import { macroDollar } from '@/lib/signals/macro/macro_dollar';
import type { MacroReading, MacroRuleDefinition } from '@/lib/signals/macro/types';
import { RULES_BY_ID } from '@/lib/signals/rules';
import type { RuleContext, Signal } from '@/lib/signals/types';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function near(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

const EMPTY_CTX: RuleContext = { history4h: [] };
const T0 = Date.parse('2026-10-07T12:00:00.000Z');
const MIN = 60_000;

function snap(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    assetId: 1,
    ts: new Date(T0).toISOString(),
    price: 100,
    marketCapUsd: null,
    volume24hUsd: null,
    rsi15m: null,
    rsi1h: null,
    rsi4h: null,
    rsi1d: null,
    ma715m: null,
    ma2515m: null,
    ma9915m: null,
    atr15m: null,
    volumeZ15m: null,
    structure15m: null,
    ma71h: null,
    ma251h: null,
    ma991h: null,
    atr1h: null,
    volumeZ1h: null,
    structure1h: null,
    ma74h: null,
    ma254h: null,
    ma994h: null,
    atr4h: null,
    volumeZ4h: null,
    structure4h: null,
    ma7Daily: null,
    ma25Daily: null,
    ma99Daily: null,
    pctFromMa7Daily: null,
    pctFromMa25Daily: null,
    pctFromMa99Daily: null,
    atrDaily: null,
    volumeZDaily: null,
    structureDaily: null,
    fundingRate: null,
    fundingRateDelta24h: null,
    openInterestUsd: null,
    openInterestChange24hPct: null,
    longShortRatio: null,
    liquidations24hUsd: null,
    liquidationsDominantSide: null,
    etfNetFlowUsd: null,
    etfStreakDays: null,
    etfFlow7dUsd: null,
    fearGreed: null,
    fearGreed7dAgo: null,
    raw: {},
    ...overrides,
  };
}

function run(
  ruleId: string,
  snapshot: MarketSnapshot,
  previous: MarketSnapshot | null = null,
  ctx: RuleContext = EMPTY_CTX,
): Signal | null {
  const definition = RULES_BY_ID[ruleId];
  if (!definition) {
    check(`${ruleId} is registered`, false, 'not found in RULES_BY_ID');
    return null;
  }
  return definition.run(snapshot, previous, ctx);
}

// ---------------------------------------------------------------------------
// etf_streak (functional 2.3, technical 4.2)
// ---------------------------------------------------------------------------

section('etf_streak');
{
  const etf = (flow: number | null, days: number | null): Signal | null =>
    run('etf_streak', snap({ etfNetFlowUsd: flow, etfStreakDays: days }));

  check('@regression 3-day streak fires', etf(10e6, 3) !== null);
  check('@regression 2-day streak with small flow does not fire', etf(10e6, 2) === null);
  check('4-day streak fires', etf(10e6, 4) !== null);

  const bigOut = etf(-100e6, null);
  check('@regression single -$100M day fires with null streak', bigOut !== null);
  check('single -$100M day is BEARISH', bigOut?.tag === 'BEARISH');
  const bigIn = etf(100e6, null);
  check('@regression single +$100M day fires with null streak', bigIn !== null);
  check('single +$100M day is BULLISH', bigIn?.tag === 'BULLISH');
  check('@regression single $99M day does not fire', etf(99e6, null) === null);
  check('single -$99M day does not fire', etf(-99e6, null) === null);
  check('single $99M day with 1-day streak does not fire', etf(99e6, 1) === null);

  check(
    'streak sign comes from the flow: outflow streak BEARISH',
    etf(-10e6, 3)?.tag === 'BEARISH',
  );
  check('streak sign comes from the flow: inflow streak BULLISH', etf(10e6, 3)?.tag === 'BULLISH');

  const sev = etf(150e6, null)?.severity;
  check('severity for a $150M day is about 0.5', sev != null && near(sev, 0.5), `got ${sev}`);
  const sevOut = etf(-150e6, null)?.severity;
  check('severity for a -$150M day is about 0.5', sevOut != null && near(sevOut, 0.5));
  check('severity clamps at 1 for a huge day', etf(900e6, null)?.severity === 1);

  check('null flow returns null even with a streak', etf(null, 5) === null);
  check('zero flow returns null even with a streak', etf(0, 5) === null);
  check('null flow and null streak returns null', etf(null, null) === null);
  check('source is ETF flows', bigOut?.source === 'ETF flows');
}

// ---------------------------------------------------------------------------
// previous-snapshot gap guard
// ---------------------------------------------------------------------------

section('previous gap (45-90 min)');
{
  check(
    '@regression gap constants are 45 and 90',
    SIGNALS_PREV_GAP_MIN_MINUTES === 45 && SIGNALS_PREV_GAP_MAX_MINUTES === 90,
  );

  // A -4% price / -6% OI move: fires long_flush AND price_velocity when the gap is ok.
  const cur = snap({ price: 96, openInterestUsd: 940 });
  const prevAt = (gapMin: number | 'none'): MarketSnapshot | null =>
    gapMin === 'none'
      ? null
      : snap({
          ts: new Date(T0 - gapMin * MIN).toISOString(),
          price: 100,
          openInterestUsd: 1000,
        });

  for (const ruleId of ['long_flush', 'price_velocity'] as const) {
    check(`@regression ${ruleId}: 45 min gap fires`, run(ruleId, cur, prevAt(45)) !== null);
    check(`${ruleId}: 60 min gap fires`, run(ruleId, cur, prevAt(60)) !== null);
    check(`@regression ${ruleId}: 90 min gap fires`, run(ruleId, cur, prevAt(90)) !== null);
    check(`@regression ${ruleId}: 44 min gap returns null`, run(ruleId, cur, prevAt(44)) === null);
    check(`@regression ${ruleId}: 91 min gap returns null`, run(ruleId, cur, prevAt(91)) === null);
    check(`@regression ${ruleId}: 2h gap returns null`, run(ruleId, cur, prevAt(120)) === null);
    check(`${ruleId}: no previous returns null`, run(ruleId, cur, prevAt('none')) === null);
  }

  const up = snap({ price: 104, openInterestUsd: 940 });
  check('short_squeeze: 45 min gap fires', run('short_squeeze', up, prevAt(45)) !== null);
  check('short_squeeze: 90 min gap fires', run('short_squeeze', up, prevAt(90)) !== null);
  check('short_squeeze: 44 min gap returns null', run('short_squeeze', up, prevAt(44)) === null);
  check('short_squeeze: 91 min gap returns null', run('short_squeeze', up, prevAt(91)) === null);
  check('short_squeeze: 2h gap returns null', run('short_squeeze', up, prevAt(120)) === null);

  const badTs = snap({ ts: 'not-a-date', price: 100, openInterestUsd: 1000 });
  check('unparseable previous ts returns null', run('price_velocity', cur, badTs) === null);
}

// ---------------------------------------------------------------------------
// long_flush / short_squeeze / price_velocity thresholds
// ---------------------------------------------------------------------------

section('long_flush / short_squeeze / price_velocity');
{
  // `MarketSnapshot.price` is typed non-null, but a stored row can still hold a null
  // price at runtime; the rules must stay silent then, so the cast is deliberate.
  const prev = (price: number | null, oi: number | null): MarketSnapshot =>
    snap({
      ts: new Date(T0 - 60 * MIN).toISOString(),
      price: price as number,
      openInterestUsd: oi,
    });
  const cur = (price: number | null, oi: number | null): MarketSnapshot =>
    snap({ price: price as number, openInterestUsd: oi });

  // long_flush: OI <= -3% AND price <= -2% over 1h
  const lf = run('long_flush', cur(98, 970), prev(100, 1000));
  check('long_flush fires at exactly OI -3% and price -2%', lf !== null);
  check('long_flush is BEARISH', lf?.tag === 'BEARISH');
  check('long_flush at the OI threshold has severity 0', lf?.severity === 0, `got ${lf?.severity}`);
  check(
    'long_flush OI -2.9% does not fire',
    run('long_flush', cur(98, 971), prev(100, 1000)) === null,
  );
  check(
    'long_flush price -1.9% does not fire',
    run('long_flush', cur(98.1, 970), prev(100, 1000)) === null,
  );
  check(
    'long_flush price up does not fire',
    run('long_flush', cur(102, 970), prev(100, 1000)) === null,
  );
  const lfDeep = run('long_flush', cur(95, 925), prev(100, 1000));
  check(
    'long_flush OI -7.5% severity is 0.9',
    lfDeep != null && near(lfDeep.severity, 0.9),
    `got ${lfDeep?.severity}`,
  );
  check(
    'long_flush null OI returns null',
    run('long_flush', cur(98, null), prev(100, 1000)) === null,
  );
  check(
    'long_flush null previous OI returns null',
    run('long_flush', cur(98, 970), prev(100, null)) === null,
  );
  check(
    'long_flush null price returns null',
    run('long_flush', cur(null, 970), prev(100, 1000)) === null,
  );
  check(
    'long_flush null previous price returns null',
    run('long_flush', cur(98, 970), prev(null, 1000)) === null,
  );
  check(
    'long_flush zero previous OI returns null',
    run('long_flush', cur(98, 970), prev(100, 0)) === null,
  );

  // short_squeeze: OI <= -3% AND price >= +2%
  const ss = run('short_squeeze', cur(102, 970), prev(100, 1000));
  check('short_squeeze fires at exactly OI -3% and price +2%', ss !== null);
  check('short_squeeze is BULLISH', ss?.tag === 'BULLISH');
  check(
    'short_squeeze price +1.9% does not fire',
    run('short_squeeze', cur(101.9, 970), prev(100, 1000)) === null,
  );
  check(
    'short_squeeze OI -2.9% does not fire',
    run('short_squeeze', cur(102, 971), prev(100, 1000)) === null,
  );
  check(
    'short_squeeze price down does not fire',
    run('short_squeeze', cur(98, 970), prev(100, 1000)) === null,
  );
  check(
    'long_flush stays silent when price rises (mirror of short_squeeze)',
    run('long_flush', cur(102, 970), prev(100, 1000)) === null,
  );
  check(
    'short_squeeze null OI returns null',
    run('short_squeeze', cur(102, null), prev(100, 1000)) === null,
  );
  check(
    'short_squeeze null price returns null',
    run('short_squeeze', cur(null, 970), prev(100, 1000)) === null,
  );

  // price_velocity: |1h return| >= 3%
  check('price_velocity constant is 3', PRICE_VELOCITY_PCT === 3);
  const pvDown = run('price_velocity', cur(97, null), prev(100, null));
  check('price_velocity fires at exactly -3%', pvDown !== null);
  check('price_velocity -3% is BEARISH', pvDown?.tag === 'BEARISH');
  const pvUp = run('price_velocity', cur(103, null), prev(100, null));
  check('price_velocity fires at exactly +3%', pvUp !== null);
  check('price_velocity +3% is BULLISH', pvUp?.tag === 'BULLISH');
  check('price_velocity at the threshold has severity 0', pvUp?.severity === 0);
  check(
    'price_velocity 2.9% does not fire',
    run('price_velocity', cur(102.9, null), prev(100, null)) === null,
  );
  check(
    'price_velocity -2.9% does not fire',
    run('price_velocity', cur(97.1, null), prev(100, null)) === null,
  );
  check(
    'price_velocity +6% has severity 1',
    run('price_velocity', cur(106, null), prev(100, null))?.severity === 1,
  );
  check(
    'price_velocity null price returns null',
    run('price_velocity', cur(null, null), prev(100, null)) === null,
  );
  check(
    'price_velocity null previous price returns null',
    run('price_velocity', cur(97, null), prev(null, null)) === null,
  );
  check(
    'price_velocity zero previous price returns null',
    run('price_velocity', cur(97, null), prev(0, null)) === null,
  );
}

// ---------------------------------------------------------------------------
// range_break
// ---------------------------------------------------------------------------

section('range_break');
{
  const N = RANGE_BREAK_LOOKBACK_CANDLES;
  const candle = (i: number, high: number, low: number, close: number): OHLCV => ({
    openTime: i * 14_400_000,
    open: close,
    high,
    low,
    close,
    volume: 1,
    closeTime: (i + 1) * 14_400_000 - 1,
  });
  /** `N` flat candles spanning low 90..high 110, then one last closed candle. */
  const series = (lastClose: number): OHLCV[] => {
    const out: OHLCV[] = [];
    for (let i = 0; i < N; i++) out.push(candle(i, 110, 90, 100));
    out.push(candle(N, Math.max(lastClose, 100), Math.min(lastClose, 100), lastClose));
    return out;
  };
  const rb = (history4h: OHLCV[]): Signal | null => run('range_break', snap(), null, { history4h });

  const lowEdge = 90 * (1 - RANGE_BREAK_BUFFER_PCT / 100); // 89.73
  const highEdge = 110 * (1 + RANGE_BREAK_BUFFER_PCT / 100); // 110.33

  const below = rb(series(lowEdge - 0.1));
  check('close below the buffered low fires', below !== null);
  check('close below the buffered low is BEARISH', below?.tag === 'BEARISH');
  const above = rb(series(highEdge + 0.1));
  check('close above the buffered high fires', above !== null);
  check('close above the buffered high is BULLISH', above?.tag === 'BULLISH');

  check(
    '@regression poke below the low but inside the buffer returns null',
    rb(series(89.8)) === null,
  );
  check(
    '@regression poke above the high but inside the buffer returns null',
    rb(series(110.2)) === null,
  );
  check('close inside the range returns null', rb(series(100)) === null);
  check('close exactly on the old low returns null', rb(series(90)) === null);

  check('@regression 84 candles (one short) returns null', rb(series(80).slice(1)) === null);
  check('@regression exactly 85 candles is enough', rb(series(80)) !== null);
  check('empty history returns null', rb([]) === null);

  // Only candles BEFORE the last closed one form the reference. A last candle with
  // an extreme wick must not widen the range it is compared against.
  const wick = series(80);
  wick[N] = candle(N, 100, 50, 80);
  check(
    '@regression last candle low is excluded from the reference window',
    rb(wick)?.tag === 'BEARISH',
  );
  const wickHigh = series(120);
  wickHigh[N] = candle(N, 200, 100, 120);
  check(
    '@regression last candle high is excluded from the reference window',
    rb(wickHigh)?.tag === 'BULLISH',
  );

  // The window is the 84 candles before the last; an older 86th candle is outside it.
  const old = [candle(-1, 500, 1, 100), ...series(100)];
  check('a candle older than the 84-candle window is ignored (no false mask)', rb(old) === null);
  const oldBreak = [candle(-1, 500, 1, 100), ...series(80)];
  check('an extreme older than the window does not mask a break', rb(oldBreak)?.tag === 'BEARISH');

  const sevSmall = below?.severity ?? -1;
  check('break severity is within 0..1', sevSmall >= 0 && sevSmall <= 1);
  const sevBig = rb(series(70))?.severity;
  check('a deep break has higher severity than a shallow one', sevBig != null && sevBig > sevSmall);
  check('source is Price range', below?.source === 'Price range');
}

// ---------------------------------------------------------------------------
// rsi_1h_extreme
// ---------------------------------------------------------------------------

section('rsi_1h_extreme');
{
  const rsi = (v: number | null): Signal | null => run('rsi_1h_extreme', snap({ rsi1h: v }));
  check('RSI 25 is BULLISH (oversold)', rsi(25)?.tag === 'BULLISH');
  check('RSI 24 is BULLISH', rsi(24)?.tag === 'BULLISH');
  check('RSI 25.1 returns null', rsi(25.1) === null);
  check('RSI 75 is BEARISH (overbought)', rsi(75)?.tag === 'BEARISH');
  check('RSI 74.9 returns null', rsi(74.9) === null);
  check('RSI 50 returns null', rsi(50) === null);
  check('RSI null returns null', rsi(null) === null);
  check(
    'severity is LOW (0.25)',
    rsi(25)?.severity === RSI_1H_EXTREME_SEVERITY && RSI_1H_EXTREME_SEVERITY === 0.25,
  );
  check('RSI 10 has the same fixed LOW severity', rsi(10)?.severity === RSI_1H_EXTREME_SEVERITY);
  check('body carries the measured RSI', rsi(75)?.body.includes('75') === true);
}

// ---------------------------------------------------------------------------
// Macro rules (functional 2.4, technical 4.2)
// ---------------------------------------------------------------------------

section('macro rules');
{
  const NOW = new Date('2026-10-09T00:00:00.000Z');
  const dayStr = (daysBeforeNow: number): string =>
    new Date(NOW.getTime() - daysBeforeNow * 86_400_000).toISOString().slice(0, 10);
  /** Newest first: latest observation `age` days before NOW, prior one day earlier. */
  const readings = (latest: number, prior: number, age: number): MacroReading[] => [
    { obsDate: dayStr(age), value: latest },
    { obsDate: dayStr(age + 1), value: prior },
  ];
  const go = (rule: MacroRuleDefinition, r: readonly MacroReading[]) => rule.run(r, NOW);

  check(
    '@regression max ages are 4 / 10 / 12 days',
    MACRO_MAX_AGE_DAYS.DGS10 === 4 &&
      MACRO_MAX_AGE_DAYS.DCOILBRENTEU === 10 &&
      MACRO_MAX_AGE_DAYS.DTWEXBGS === 12,
  );
  check(
    'thresholds are Brent 3%, 10Y 8 bp, dollar 0.5%',
    MACRO_THRESHOLDS.DCOILBRENTEU.value === 3 &&
      MACRO_THRESHOLDS.DGS10.value === 8 &&
      MACRO_THRESHOLDS.DGS10.kind === 'bp' &&
      MACRO_THRESHOLDS.DTWEXBGS.value === 0.5,
  );

  // Brent +-3%
  const bUp = go(macroBrent, readings(82.4, 80, 1));
  check('Brent +3% fires', bUp !== null);
  check('Brent rising is BEARISH', bUp?.tag === 'BEARISH');
  const bDown = go(macroBrent, readings(77.6, 80, 1));
  check('Brent -3% fires', bDown !== null);
  check('Brent falling is BULLISH', bDown?.tag === 'BULLISH');
  check('Brent +2.9% does not fire', go(macroBrent, readings(82.32, 80, 1)) === null);
  check('Brent -2.9% does not fire', go(macroBrent, readings(77.68, 80, 1)) === null);
  check('Brent at the threshold has severity 0', bUp?.severity === 0, `got ${bUp?.severity}`);
  check('Brent +6% has severity 1', go(macroBrent, readings(84.8, 80, 1))?.severity === 1);
  check('macro ruleId is carried', bUp?.ruleId === 'macro_brent');

  // 10Y +-8 bp (quoted in percent)
  const yUp = go(macro10y, readings(4.08, 4.0, 1));
  check('10Y +8 bp fires', yUp !== null);
  check('10Y rising is BEARISH', yUp?.tag === 'BEARISH');
  const yDown = go(macro10y, readings(3.92, 4.0, 1));
  check('10Y -8 bp fires', yDown !== null);
  check('10Y falling is BULLISH', yDown?.tag === 'BULLISH');
  check('10Y +7 bp does not fire', go(macro10y, readings(4.07, 4.0, 1)) === null);
  check('10Y -7 bp does not fire', go(macro10y, readings(3.93, 4.0, 1)) === null);
  check('10Y body states basis points', yUp?.body.includes('8 bp') === true, yUp?.body ?? '');

  // Dollar +-0.5%
  const dUp = go(macroDollar, readings(100.5, 100, 1));
  check('dollar +0.5% fires', dUp !== null);
  check('dollar rising is BEARISH', dUp?.tag === 'BEARISH');
  const dDown = go(macroDollar, readings(99.5, 100, 1));
  check('dollar -0.5% fires', dDown !== null);
  check('dollar falling is BULLISH', dDown?.tag === 'BULLISH');
  check('dollar +0.4% does not fire', go(macroDollar, readings(100.4, 100, 1)) === null);
  check('dollar -0.4% does not fire', go(macroDollar, readings(99.6, 100, 1)) === null);

  // Missing readings
  const rules: [string, MacroRuleDefinition][] = [
    ['Brent', macroBrent],
    ['10Y', macro10y],
    ['dollar', macroDollar],
  ];
  for (const [name, rule] of rules) {
    check(`${name}: no readings returns null`, go(rule, []) === null);
    check(`${name}: one reading returns null`, go(rule, readings(200, 1, 1).slice(0, 1)) === null);
    check(
      `${name}: non-finite value returns null`,
      go(rule, [
        { obsDate: dayStr(1), value: Number.NaN },
        { obsDate: dayStr(2), value: 1 },
      ]) === null,
    );
    check(
      `${name}: invalid obsDate returns null`,
      go(rule, [
        { obsDate: 'garbage', value: 200 },
        { obsDate: dayStr(2), value: 1 },
      ]) === null,
    );
  }
  check('zero prior value (pct) returns null', go(macroBrent, readings(5, 0, 1)) === null);

  // Weekly-batch lag and per-series max age
  check(
    '@regression Brent obs 9 days old still fires',
    go(macroBrent, readings(82.4, 80, 9)) !== null,
  );
  check(
    '@regression Brent obs 10 days old still fires',
    go(macroBrent, readings(82.4, 80, 10)) !== null,
  );
  check(
    '@regression Brent obs 11 days old returns null',
    go(macroBrent, readings(82.4, 80, 11)) === null,
  );
  check(
    '@regression DGS10 obs 4 days old still fires',
    go(macro10y, readings(4.08, 4.0, 4)) !== null,
  );
  check(
    '@regression DGS10 obs 5 days old returns null',
    go(macro10y, readings(4.08, 4.0, 5)) === null,
  );
  check(
    '@regression DTWEXBGS obs 12 days old fires',
    go(macroDollar, readings(100.5, 100, 12)) !== null,
  );
  check(
    '@regression DTWEXBGS obs 13 days old returns null',
    go(macroDollar, readings(100.5, 100, 13)) === null,
  );

  // "As of" text and since_ts
  const asOf = go(macroBrent, readings(82.4, 80, 3));
  check(
    'card text contains the "as of" date',
    asOf?.body.includes('as of 10-06') === true,
    asOf?.body ?? '',
  );
  check(
    '@regression since_ts equals the observation date at 00:00Z',
    asOf?.sinceTs === '2026-10-06T00:00:00.000Z',
    `got ${asOf?.sinceTs}`,
  );
  const asOfY = go(macro10y, readings(4.08, 4.0, 2));
  check('10Y since_ts equals the observation date', asOfY?.sinceTs === '2026-10-07T00:00:00.000Z');
  check('10Y card text contains the "as of" date', asOfY?.body.includes('as of 10-07') === true);
  const asOfD = go(macroDollar, readings(100.5, 100, 7));
  check(
    'dollar since_ts equals the observation date',
    asOfD?.sinceTs === '2026-10-02T00:00:00.000Z',
  );
  check('dollar card text contains the "as of" date', asOfD?.body.includes('as of 10-02') === true);
  check('macro source is FRED', asOf?.source === 'FRED');
}

// ---------------------------------------------------------------------------
// 2026-10-07 replay (functional 2.3 acceptance)
// ---------------------------------------------------------------------------

section('2026-10-07 ETH replay (fixture)');
{
  interface FixtureRow {
    ts: string;
    price: number;
    openInterestUsd: number;
    rsi1h: number;
    etfNetFlowUsd: number | null;
    etfStreakDays: number | null;
  }
  const raw = readFileSync(
    join(process.cwd(), 'src/scripts/fixtures/027-eth-2026-10-07.json'),
    'utf8',
  );
  const rows = (JSON.parse(raw) as { snapshots: FixtureRow[] }).snapshots;
  const at = (iso: string): MarketSnapshot => {
    const row = rows.find((r) => r.ts === iso);
    if (!row) throw new Error(`fixture is missing ${iso}`);
    return snap({
      ts: row.ts,
      price: row.price,
      openInterestUsd: row.openInterestUsd,
      rsi1h: row.rsi1h,
      etfNetFlowUsd: row.etfNetFlowUsd,
      etfStreakDays: row.etfStreakDays,
    });
  };

  // Acceptance (functional 2.3): the drop hour in real data, 01:00Z -> 02:00Z,
  // ETH 2692.59 -> 2599.46 (-3.5%), OI -3.4%.
  const drop = at('2026-10-07T02:00:00.000Z');
  const before = at('2026-10-07T01:00:00.000Z');
  const flush = run('long_flush', drop, before);
  const velocity = run('price_velocity', drop, before);
  check(
    '@regression functional 2.3: real 02:00Z drop fires long_flush BEARISH',
    flush?.tag === 'BEARISH',
  );
  check(
    '@regression functional 2.3: real 02:00Z drop fires price_velocity BEARISH',
    velocity?.tag === 'BEARISH',
  );
  check(
    'real 02:00Z RSI 1h (17) fires rsi_1h_extreme BULLISH',
    run('rsi_1h_extreme', drop)?.tag === 'BULLISH',
  );

  // Synthetic (functional 2.3): ETF flows were not stored on 10-07 (null before
  // 2026-10-09), so the fields that were public that day are injected into the same
  // snapshot: -$201.9M on 10-06, 3+ outflow days.
  check(
    'stored 02:00Z snapshot has null ETF fields (nothing to replay)',
    run('etf_streak', drop) === null,
  );
  const injected = { ...drop, etfNetFlowUsd: -201.9e6, etfStreakDays: 3 };
  const etf = run('etf_streak', injected, before);
  check(
    '@regression functional 2.3: 02:00Z snapshot with injected ETF fields fires etf_streak BEARISH',
    etf?.tag === 'BEARISH',
    `got ${etf?.tag}`,
  );
  check(
    'injected etf_streak body carries the $201.9M figure',
    etf?.body.includes('$201.9M') === true,
    etf?.body ?? '',
  );
  check(
    'injected etf_streak title carries the streak',
    etf?.title.includes('3 days') === true,
    etf?.title ?? '',
  );
}

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
