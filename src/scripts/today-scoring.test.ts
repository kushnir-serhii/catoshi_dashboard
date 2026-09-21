/**
 * Tests for Today Range daily scoring (spec 024 Slice 4).
 * Run: node --import tsx --test src/scripts/today-scoring.test.ts
 *
 * No database and no network: every dependency is an injected fake. The SQL in
 * `src/lib/db/todayRange.ts` is NOT executed here; only its parameter mapping
 * and row mappers are checked.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COLLECT_ASSETS } from '@/consts/collect';
import { TODAY_MODEL_VERSION } from '@/consts/today';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import {
  insertParams,
  type PredictionInsert,
  type PredictionResolution,
  type ResolvedTrackRow,
  type UnresolvedPrediction,
} from '@/lib/db/todayRange';
import { buildTodayResponse } from '@/lib/todayApi';
import {
  isInBand,
  issueWindow,
  realizedFromKlines,
  resolvePrediction,
  runTodayScoring,
  summarizeTrack,
  type TodayScoringDeps,
} from '@/lib/todayScoring';

const HOUR = 3_600_000;
const T = (iso: string): number => Date.parse(iso);

/** Aligned 1h bar opening at `openTime`. */
function bar(openTime: number, close: number, high = close + 1, low = close - 1): OHLCV {
  return { openTime, open: close, high, low, close, volume: 1, closeTime: openTime + HOUR - 1 };
}

/** `n` aligned closed bars ending with the bar that closed just before `endMs` (an hour boundary). */
function history(endMs: number, n: number): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = n; i >= 1; i -= 1) out.push(bar(endMs - i * HOUR, 100 + Math.sin(i) * 2));
  return out;
}

describe('issueWindow (never backdate)', () => {
  it('the 00:00 run issues at 00:00 UTC, horizon +24h', () => {
    const w = issueWindow(T('2026-09-21T00:07:31.000Z'));
    assert.equal(w.issuedAt.toISOString(), '2026-09-21T00:00:00.000Z');
    assert.equal(w.horizonEnd.toISOString(), '2026-09-22T00:00:00.000Z');
  });

  it('a run that missed 00:00 issues at its OWN hour with its own horizon', () => {
    const w = issueWindow(T('2026-09-21T05:12:00.000Z'));
    assert.equal(w.issuedAt.toISOString(), '2026-09-21T05:00:00.000Z');
    assert.equal(w.horizonEnd.toISOString(), '2026-09-22T05:00:00.000Z');
  });

  it('day bounds are the UTC day of issued_at', () => {
    const w = issueWindow(T('2026-09-21T23:59:59.000Z'));
    assert.equal(w.dayStart.toISOString(), '2026-09-21T00:00:00.000Z');
    assert.equal(w.dayEnd.toISOString(), '2026-09-22T00:00:00.000Z');
  });
});

describe('in-band arithmetic', () => {
  it('is inclusive on both edges', () => {
    assert.equal(isInBand(10, 10, 20), true);
    assert.equal(isInBand(20, 10, 20), true);
    assert.equal(isInBand(9.999999, 10, 20), false);
    assert.equal(isInBand(20.000001, 10, 20), false);
  });

  it('50% and 90% bands are judged independently', () => {
    const row = { p05: 80, p25: 90, p75: 110, p95: 120 };
    const at = (close: number): PredictionResolution =>
      resolvePrediction(row, { close, high: close, low: close }, new Date(0));
    assert.deepEqual([at(100).inBand50, at(100).inBand90], [true, true]);
    assert.deepEqual([at(90).inBand50, at(90).inBand90], [true, true]); // p25 boundary
    assert.deepEqual([at(115).inBand50, at(115).inBand90], [false, true]);
    assert.deepEqual([at(120).inBand50, at(120).inBand90], [false, true]); // p95 boundary
    assert.deepEqual([at(80).inBand50, at(80).inBand90], [false, true]); // p05 boundary
    assert.deepEqual([at(79.99).inBand50, at(79.99).inBand90], [false, false]);
  });
});

describe('realizedFromKlines', () => {
  const issued = T('2026-09-20T00:00:00.000Z');
  const horizon = issued + 24 * HOUR;

  function window24(): OHLCV[] {
    const out: OHLCV[] = [];
    for (let i = 0; i < 24; i += 1)
      out.push(bar(issued + i * HOUR, 100 + i, 100 + i + 1, 100 + i - 1));
    return out;
  }

  it('close is the bar ending at horizon_end; high/low span the whole window', () => {
    const candles = window24();
    candles[5] = bar(issued + 5 * HOUR, 105, 150, 105 - 1); // spike high
    candles[9] = bar(issued + 9 * HOUR, 109, 110, 60); // spike low
    const r = realizedFromKlines(candles, issued, horizon);
    assert.ok(r);
    assert.equal(r.close, 123); // last bar (opens horizon-1h, closes at horizon)
    assert.equal(r.high, 150);
    assert.equal(r.low, 60);
  });

  it('ignores bars outside (issued_at, horizon_end], incl. the bar before and the bar after', () => {
    const candles = [
      bar(issued - HOUR, 100, 9999, 1), // before the window
      ...window24(),
      bar(horizon, 100, 9999, 1), // opens at horizon_end: belongs to the next window
    ];
    const r = realizedFromKlines(candles, issued, horizon);
    assert.ok(r);
    assert.equal(r.high, 124);
    assert.equal(r.low, 99);
    assert.equal(r.close, 123);
  });

  it('returns null when any bar is missing (never guess)', () => {
    const candles = window24().filter((c) => c.openTime !== issued + 7 * HOUR);
    assert.equal(realizedFromKlines(candles, issued, horizon), null);
  });

  it('returns null when the newest bar (horizon close) is not available yet', () => {
    const candles = window24().slice(0, 23);
    assert.equal(realizedFromKlines(candles, issued, horizon), null);
  });

  it('returns null for a non-integer-hour window or empty klines', () => {
    assert.equal(realizedFromKlines([], issued, horizon), null);
    assert.equal(realizedFromKlines(window24(), issued, horizon + 1), null);
  });
});

describe('summarizeTrack', () => {
  const row = (
    day: number,
    modelVersion: number,
    inBand90: boolean,
    inBand50 = false,
  ): ResolvedTrackRow => ({
    modelVersion,
    resolvedAt: new Date(Date.UTC(2026, 8, day)),
    inBand50,
    inBand90,
  });

  it('uses the current model version only', () => {
    const rows = [
      row(1, TODAY_MODEL_VERSION, true),
      row(2, TODAY_MODEL_VERSION + 1, true),
      row(3, 0, true),
    ];
    assert.deepEqual(summarizeTrack(rows), { n: 1, held90: 1, held50: 0 });
  });

  it('takes the newest 30 and counts held90 / held50', () => {
    const rows: ResolvedTrackRow[] = [];
    for (let d = 1; d <= 40; d += 1)
      rows.push(row(d, TODAY_MODEL_VERSION, d % 2 === 0, d % 4 === 0));
    // Days 11..40 are the newest 30: 15 even days, 8 multiples of 4 (12..40).
    assert.deepEqual(summarizeTrack(rows), { n: 30, held90: 15, held50: 8 });
  });

  it('empty input gives n = 0', () => {
    assert.deepEqual(summarizeTrack([]), { n: 0, held90: 0, held50: 0 });
  });
});

describe('buildTodayResponse track wiring', () => {
  const NOW = T('2026-09-21T10:30:00.000Z');
  const base = {
    now: NOW,
    getKlines: async () => ({
      ok: true as const,
      candles: history(T('2026-09-21T10:00:00.000Z'), 100),
    }),
    getSpot: async () => ({ price: 101, ts: NOW - 60_000 }),
  };

  it('fills track from the injected reader', async () => {
    const res = await buildTodayResponse('bitcoin', {
      ...base,
      getTrack: async () => ({ n: 20, held90: 18, held50: 10 }),
    });
    assert.equal(res.status, 'ok');
    if (res.status === 'ok') assert.deepEqual(res.track, { n: 20, held90: 18, held50: 10 });
  });

  it('a failing reader yields track null and does not fail the route', async () => {
    const res = await buildTodayResponse('bitcoin', {
      ...base,
      getTrack: async () => {
        throw new Error('db down');
      },
    });
    assert.equal(res.status, 'ok');
    if (res.status === 'ok') assert.equal(res.track, null);
  });
});

describe('runTodayScoring', () => {
  const RUN_AT = T('2026-09-21T00:07:00.000Z');

  interface Harness {
    deps: TodayScoringDeps;
    inserts: PredictionInsert[];
    resolutions: { id: string | number; r: PredictionResolution }[];
    klineCalls: string[];
  }

  function harness(over: Partial<TodayScoringDeps> = {}, now = RUN_AT): Harness {
    const inserts: PredictionInsert[] = [];
    const resolutions: Harness['resolutions'] = [];
    const klineCalls: string[] = [];
    const hourStart = Math.floor(now / HOUR) * HOUR;
    const deps: TodayScoringDeps = {
      now,
      assets: COLLECT_ASSETS,
      getKlines: async (pair) => {
        klineCalls.push(pair);
        return { ok: true, candles: history(hourStart, 100) };
      },
      getSpot: async () => ({ price: 100, ts: now - 60_000 }),
      findAssetId: async (symbol) => `id-${symbol}`,
      hasIssuedInDay: async () => false,
      insertPrediction: async (row) => {
        inserts.push(row);
        return true;
      },
      listUnresolved: async () => [],
      markResolved: async (id, r) => {
        resolutions.push({ id, r });
      },
      ...over,
    };
    return { deps, inserts, resolutions, klineCalls };
  }

  it('issues one row per tracked asset at the 00:00 run, at issued_at 00:00', async () => {
    const h = harness();
    const res = await runTodayScoring(h.deps);
    assert.equal(res.issued, 3);
    assert.equal(h.inserts.length, 3);
    for (const row of h.inserts) {
      assert.equal(row.issuedAt.toISOString(), '2026-09-21T00:00:00.000Z');
      assert.equal(row.horizonEnd.toISOString(), '2026-09-22T00:00:00.000Z');
      assert.equal(row.modelVersion, TODAY_MODEL_VERSION);
      assert.ok(row.p05 < row.p25 && row.p25 < row.spot && row.spot < row.p75 && row.p75 < row.p95);
    }
  });

  it('a run that missed 00:00 issues with its actual hour, not 00:00', async () => {
    const h = harness({}, T('2026-09-21T04:20:00.000Z'));
    await runTodayScoring(h.deps);
    assert.equal(h.inserts[0].issuedAt.toISOString(), '2026-09-21T04:00:00.000Z');
    assert.equal(h.inserts[0].horizonEnd.toISOString(), '2026-09-22T04:00:00.000Z');
  });

  it('a second run the same UTC day issues nothing and skips the network', async () => {
    const h = harness({ hasIssuedInDay: async () => true }, T('2026-09-21T13:05:00.000Z'));
    const res = await runTodayScoring(h.deps);
    assert.equal(res.issued, 0);
    assert.equal(h.inserts.length, 0);
    assert.equal(h.klineCalls.length, 0);
    assert.ok(res.sources.filter((s) => s.source.startsWith('today:issue')).every((s) => s.ok));
  });

  it('dedupe is checked against the UTC day of the run', async () => {
    const seen: [string, string][] = [];
    const h = harness(
      {
        hasIssuedInDay: async (_id, start, end) => {
          seen.push([start.toISOString(), end.toISOString()]);
          return true;
        },
      },
      T('2026-09-21T23:30:00.000Z'),
    );
    await runTodayScoring(h.deps);
    assert.deepEqual(seen[0], ['2026-09-21T00:00:00.000Z', '2026-09-22T00:00:00.000Z']);
  });

  it('failed klines: no row, reason surfaced in SourceStatus', async () => {
    const h = harness({
      getKlines: async () => ({
        ok: false,
        reason: { kind: 'http', status: 451 },
        detail: 'blocked',
      }),
    });
    const res = await runTodayScoring(h.deps);
    assert.equal(h.inserts.length, 0);
    const issue = res.sources.find((s) => s.source === 'today:issue:BTC');
    assert.ok(issue && !issue.ok);
    assert.match(issue.error ?? '', /klines_failed.*http 451/);
  });

  it('stale klines: no row', async () => {
    const stale = T('2026-09-20T20:00:00.000Z'); // newest closed bar ~4h old
    const h = harness({ getKlines: async () => ({ ok: true, candles: history(stale, 100) }) });
    const res = await runTodayScoring(h.deps);
    assert.equal(h.inserts.length, 0);
    assert.match(res.sources.find((s) => s.source === 'today:issue:ETH')?.error ?? '', /stale/);
  });

  it('insufficient bars: no row', async () => {
    const h = harness({
      getKlines: async () => ({ ok: true, candles: history(T('2026-09-21T00:00:00.000Z'), 10) }),
    });
    const res = await runTodayScoring(h.deps);
    assert.equal(h.inserts.length, 0);
    assert.match(
      res.sources.find((s) => s.source === 'today:issue:SOL')?.error ?? '',
      /insufficient/,
    );
  });

  it('stale or missing spot: no row', async () => {
    const h = harness({ getSpot: async () => null });
    await runTodayScoring(h.deps);
    assert.equal(h.inserts.length, 0);
  });

  it('one asset throwing does not stop the others or the resolve step', async () => {
    const h = harness({
      findAssetId: async (symbol) => {
        if (symbol === 'ETH') throw new Error('boom');
        return `id-${symbol}`;
      },
    });
    const res = await runTodayScoring(h.deps);
    assert.equal(res.issued, 2);
    assert.equal(res.sources.find((s) => s.source === 'today:issue:ETH')?.ok, false);
    assert.ok(res.sources.some((s) => s.source === 'today:resolve'));
  });

  describe('resolve', () => {
    const issuedAt = new Date('2026-09-20T00:00:00.000Z');
    const horizonEnd = new Date('2026-09-21T00:00:00.000Z');
    const due = (over: Partial<UnresolvedPrediction> = {}): UnresolvedPrediction => ({
      id: 7,
      symbol: 'BTC',
      binancePair: 'BTCUSDT',
      issuedAt,
      horizonEnd,
      p05: 90,
      p25: 96,
      p75: 104,
      p95: 110,
      ...over,
    });
    function fullWindow(): OHLCV[] {
      const out: OHLCV[] = [];
      for (let i = 0; i < 24; i += 1) out.push(bar(issuedAt.getTime() + i * HOUR, 100, 101, 99));
      out[3] = bar(issuedAt.getTime() + 3 * HOUR, 100, 108, 99);
      out[23] = bar(issuedAt.getTime() + 23 * HOUR, 97, 98, 95);
      return out;
    }
    // All three assets are already issued today, so only resolve is exercised.
    const issuedAlready = { hasIssuedInDay: async () => true };

    it('writes realized close/high/low and band flags from fixture klines', async () => {
      const h = harness({
        ...issuedAlready,
        listUnresolved: async () => [due()],
        getKlines: async () => ({ ok: true, candles: fullWindow() }),
      });
      const res = await runTodayScoring(h.deps);
      assert.equal(res.resolved, 1);
      assert.equal(h.resolutions.length, 1);
      const { id, r } = h.resolutions[0];
      assert.equal(id, 7);
      assert.equal(r.realizedClose, 97);
      assert.equal(r.realizedHigh, 108);
      assert.equal(r.realizedLow, 95);
      assert.equal(r.inBand50, true); // 96 <= 97 <= 104
      assert.equal(r.inBand90, true);
      assert.equal(r.resolvedAt.getTime(), RUN_AT);
    });

    it('a close outside the 50% band but inside the 90% band', async () => {
      const h = harness({
        ...issuedAlready,
        listUnresolved: async () => [due({ p25: 98 })],
        getKlines: async () => ({ ok: true, candles: fullWindow() }),
      });
      await runTodayScoring(h.deps);
      assert.equal(h.resolutions[0].r.inBand50, false);
      assert.equal(h.resolutions[0].r.inBand90, true);
    });

    it('klines failure leaves rows unresolved and reports it', async () => {
      const h = harness({
        ...issuedAlready,
        listUnresolved: async () => [due()],
        getKlines: async () => ({ ok: false, reason: { kind: 'network' }, detail: 'x' }),
      });
      const res = await runTodayScoring(h.deps);
      assert.equal(res.resolved, 0);
      assert.equal(h.resolutions.length, 0);
      const s = res.sources.find((x) => x.source === 'today:resolve');
      assert.equal(s?.ok, false);
    });

    it('missing bars leave the row unresolved (never guessed)', async () => {
      const h = harness({
        ...issuedAlready,
        listUnresolved: async () => [due()],
        getKlines: async () => ({ ok: true, candles: fullWindow().slice(0, 20) }),
      });
      const res = await runTodayScoring(h.deps);
      assert.equal(res.resolved, 0);
      assert.equal(h.resolutions.length, 0);
    });

    it('a DB write failure on one row does not block the next', async () => {
      const second = due({ id: 8, symbol: 'BTC' });
      const h = harness({
        ...issuedAlready,
        listUnresolved: async () => [due(), second],
        getKlines: async () => ({ ok: true, candles: fullWindow() }),
        markResolved: async (id, r) => {
          if (id === 7) throw new Error('write failed');
          h.resolutions.push({ id, r });
        },
      });
      const res = await runTodayScoring(h.deps);
      assert.equal(res.resolved, 1);
      assert.equal(h.resolutions[0].id, 8);
      assert.equal(res.sources.find((x) => x.source === 'today:resolve')?.ok, false);
    });
  });
});

describe('insertParams', () => {
  it('maps to the 13 positional SQL parameters, dates as ISO strings', () => {
    const w = issueWindow(T('2026-09-21T05:12:00.000Z'));
    const params = insertParams({
      assetId: 'a1',
      issuedAt: w.issuedAt,
      horizonEnd: w.horizonEnd,
      dayStart: w.dayStart,
      dayEnd: w.dayEnd,
      spot: 100,
      sigmaHourly: 0.01,
      k: 1,
      modelVersion: 1,
      p05: 80,
      p25: 90,
      p75: 110,
      p95: 120,
    });
    assert.equal(params.length, 13);
    assert.equal(params[1], '2026-09-21T05:00:00.000Z');
    assert.equal(params[11], '2026-09-21T00:00:00.000Z');
    assert.equal(params[12], '2026-09-22T00:00:00.000Z');
  });
});
