/**
 * `assembleSnapshot` price-fallback tests for spec 023 Slice 2
 * (technical-considerations.md §4).
 *
 * Run:  npx tsx src/scripts/snapshot-builder.test.ts
 *
 * No database, no network — `assembleSnapshot` is pure over pre-fetched
 * candles, so plain fixtures and assertions are enough. Exits non-zero on
 * failure. Follows the `src/scripts/scoring.test.ts` harness pattern.
 */

import type { KlinesByTimeframe, KlinesFailuresByTimeframe, OHLCV } from '@/lib/collectors/binanceKlines';
import { assembleSnapshot, type AssembleSnapshotInput } from '@/lib/snapshotBuilder';

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

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

/** One synthetic candle: OHLC all equal `close`, `closeTime` derived from `openTime`. */
function candle(openTime: number, close: number): OHLCV {
  return { openTime, open: close, high: close, low: close, close, volume: 1000, closeTime: openTime + 1 };
}

/** `count` ascending candles ending at `close`, spaced 1ms apart — enough for any indicator window used below. */
function series(count: number, close: number): OHLCV[] {
  return Array.from({ length: count }, (_, i) => candle(i * 10, close + i));
}

function baseInput(klinesByTf: KlinesByTimeframe, klinesFailures?: KlinesFailuresByTimeframe): AssembleSnapshotInput {
  return {
    assetId: 1,
    ts: new Date('2026-09-18T14:00:00Z'),
    klinesByTf,
    fearGreed: null,
    klinesFailures,
    sliceAt: null,
  };
}

// ---------------------------------------------------------------------------
section('Price fallback order 1d -> 4h -> 1h -> 15m (§2.2, §4)');
// ---------------------------------------------------------------------------

{
  // 1d dead, 4h populated: price comes from 4h, and daily-only fields stay null.
  const klinesByTf: KlinesByTimeframe = {
    '15m': null,
    '1h': null,
    '4h': series(30, 100),
    '1d': null,
  };
  const { snapshot, sources } = assembleSnapshot(baseInput(klinesByTf));

  check('1d null + populated 4h: snapshot is written (no throw)', snapshot.price !== null);
  check('1d null + populated 4h: price equals the last 4h close', snapshot.price === 129);
  check(
    'raw.priceSource records "4h"',
    (snapshot.raw as { priceSource: string }).priceSource === '4h',
  );
  check(
    'a "price:fallback" SourceStatus is emitted with note "4h"',
    sources.some((s) => s.source === 'price:fallback' && s.ok === true && s.note === '4h'),
  );
  check('ma7Daily stays null without daily candles', snapshot.ma7Daily === null);
  check('ma25Daily stays null without daily candles', snapshot.ma25Daily === null);
  check('ma99Daily stays null without daily candles', snapshot.ma99Daily === null);
  check('pctFromMa7Daily stays null (its MA is null)', snapshot.pctFromMa7Daily === null);
  check('atrDaily stays null without daily candles', snapshot.atrDaily === null);
  check('volumeZDaily stays null without daily candles', snapshot.volumeZDaily === null);
  check('structureDaily stays null without daily candles', snapshot.structureDaily === null);
  check('volume24hUsd stays null without daily candles', snapshot.volume24hUsd === null);
  // 4h indicators, by contrast, DO get computed — the fallback only skips
  // the *Daily columns, never the 4h ones the price actually came from.
  check('ma74h IS computed from the 4h series that supplied the price', snapshot.ma74h !== null);
}

{
  // 1d and 4h both dead, 1h populated: price falls through to 1h.
  const klinesByTf: KlinesByTimeframe = {
    '15m': null,
    '1h': series(30, 200),
    '4h': null,
    '1d': null,
  };
  const { snapshot } = assembleSnapshot(baseInput(klinesByTf));
  check(
    '1d + 4h null, populated 1h: priceSource is "1h"',
    (snapshot.raw as { priceSource: string }).priceSource === '1h',
  );
  check('1d + 4h null, populated 1h: price equals the last 1h close', snapshot.price === 229);
}

{
  // Only 15m survives: price falls all the way through.
  const klinesByTf: KlinesByTimeframe = {
    '15m': series(30, 50),
    '1h': null,
    '4h': null,
    '1d': null,
  };
  const { snapshot } = assembleSnapshot(baseInput(klinesByTf));
  check(
    'only 15m populated: priceSource is "15m"',
    (snapshot.raw as { priceSource: string }).priceSource === '15m',
  );
}

{
  // 1d itself populated: no fallback, no price:fallback SourceStatus.
  const klinesByTf: KlinesByTimeframe = {
    '15m': series(30, 10),
    '1h': series(30, 20),
    '4h': series(30, 30),
    '1d': series(30, 40),
  };
  const { snapshot, sources } = assembleSnapshot(baseInput(klinesByTf));
  check(
    'populated 1d: priceSource is "1d"',
    (snapshot.raw as { priceSource: string }).priceSource === '1d',
  );
  check(
    'populated 1d: no "price:fallback" SourceStatus is emitted',
    !sources.some((s) => s.source === 'price:fallback'),
  );
  check('populated 1d: ma7Daily IS computed', snapshot.ma7Daily !== null);
}

// ---------------------------------------------------------------------------
section('Every timeframe empty: the guard still throws (§2.2)');
// ---------------------------------------------------------------------------

{
  const klinesByTf: KlinesByTimeframe = { '15m': null, '1h': null, '4h': null, '1d': null };
  check(
    'all four timeframes null: assembleSnapshot throws',
    throws(() => assembleSnapshot(baseInput(klinesByTf))),
  );
}

{
  // Empty arrays (fetch "succeeded" but returned zero candles) are just as
  // unusable as null — the guard must check series length, not nullness.
  const klinesByTf: KlinesByTimeframe = { '15m': [], '1h': [], '4h': [], '1d': [] };
  check(
    'all four timeframes empty arrays: assembleSnapshot throws',
    throws(() => assembleSnapshot(baseInput(klinesByTf))),
  );
}

{
  check('null klinesByTf altogether: assembleSnapshot throws', throws(() => assembleSnapshot(baseInput(null as unknown as KlinesByTimeframe))));
}

// ---------------------------------------------------------------------------
section('Per-timeframe failure reasons flow into klines:<tf> SourceStatus (§2.1, Slice 1)');
// ---------------------------------------------------------------------------

{
  const klinesByTf: KlinesByTimeframe = { '15m': null, '1h': null, '4h': null, '1d': null };
  // One populated timeframe so assembleSnapshot doesn't throw before we can
  // inspect the per-timeframe statuses.
  klinesByTf['15m'] = series(30, 5);
  const klinesFailures: KlinesFailuresByTimeframe = {
    '1d': { ok: false, reason: { kind: 'http', status: 451 }, detail: 'geo-blocked' },
    '4h': { ok: false, reason: { kind: 'network' }, detail: 'ECONNRESET' },
    '1h': { ok: false, reason: { kind: 'malformed' }, detail: 'not an array' },
  };
  const { sources } = assembleSnapshot(baseInput(klinesByTf, klinesFailures));

  check(
    'klines:1d carries the real HTTP status, not a generic message',
    sources.some((s) => s.source === 'klines:1d' && s.error === 'http 451'),
  );
  check(
    'klines:4h carries "network"',
    sources.some((s) => s.source === 'klines:4h' && s.error === 'network'),
  );
  check(
    'klines:1h carries "malformed"',
    sources.some((s) => s.source === 'klines:1h' && s.error === 'malformed'),
  );
}

{
  // No failures map supplied (the backfill path never tracks per-timeframe
  // reasons) — falls back to the pre-Slice-1 generic message rather than
  // throwing or fabricating a reason.
  const klinesByTf: KlinesByTimeframe = { '15m': series(30, 5), '1h': null, '4h': null, '1d': null };
  const { sources } = assembleSnapshot(baseInput(klinesByTf));
  check(
    'no klinesFailures supplied: falls back to "fetch failed"',
    sources.some((s) => s.source === 'klines:1d' && s.error === 'fetch failed'),
  );
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0 ? `\nAll ${checks} checks passed.\n` : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
