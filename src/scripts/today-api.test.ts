/**
 * Tests for `/api/today` logic (spec 024 Slice 2).
 * Run: node --import tsx --test src/scripts/today-api.test.ts
 * No network: fetchers and the clock are injected.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TODAY_MIN_BARS, TODAY_STALE_MINUTES } from '@/consts/today';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import { buildTodayResponse, type TodayDeps } from '@/lib/todayApi';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-21T10:30:00.000Z');

/** `n` closed bars, the newest having closed `lastClosedAgoMin` minutes before NOW. */
function bars(n: number, lastClosedAgoMin: number): OHLCV[] {
  const lastClose = NOW - lastClosedAgoMin * 60_000;
  const out: OHLCV[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const closeTime = lastClose - i * HOUR;
    const close = 100 + Math.sin(i) * 2;
    out.push({
      openTime: closeTime - HOUR + 1,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1,
      closeTime,
    });
  }
  return out;
}

function deps(over: Partial<TodayDeps> & { candles?: OHLCV[] } = {}): TodayDeps {
  const { candles, ...rest } = over;
  return {
    now: NOW,
    getKlines: async () => ({ ok: true, candles: candles ?? bars(100, 30) }),
    getSpot: async () => ({ price: 101, ts: NOW - 60_000 }),
    ...rest,
  };
}

function assertNoNumbers(res: object): void {
  for (const [key, value] of Object.entries(res)) {
    assert.notEqual(typeof value, 'number', `unexpected numeric field ${key}`);
  }
}

describe('buildTodayResponse', () => {
  it('untracked coin', async () => {
    const res = await buildTodayResponse('dogecoin', deps());
    assert.deepEqual(res, { status: 'unavailable', reason: 'untracked' });
  });

  it('klines_failed surfaces the failure reason and no numbers', async () => {
    const res = await buildTodayResponse(
      'bitcoin',
      deps({
        getKlines: async () => ({ ok: false, reason: { kind: 'http', status: 451 }, detail: '' }),
      }),
    );
    assert.equal(res.status, 'unavailable');
    if (res.status === 'unavailable') {
      assert.equal(res.reason, 'klines_failed');
      assert.equal(res.klinesFailure, 'http 451');
    }
    assertNoNumbers(res);
  });

  it('stale boundary: exactly TODAY_STALE_MINUTES is fresh, one minute more is stale', async () => {
    const fresh = await buildTodayResponse(
      'bitcoin',
      deps({ candles: bars(100, TODAY_STALE_MINUTES) }),
    );
    assert.equal(fresh.status, 'ok');
    const stale = await buildTodayResponse(
      'bitcoin',
      deps({ candles: bars(100, TODAY_STALE_MINUTES + 1) }),
    );
    assert.equal(stale.status, 'unavailable');
    if (stale.status === 'unavailable') {
      assert.equal(stale.reason, 'stale');
      assert.equal(typeof stale.lastBarTs, 'string');
    }
    assertNoNumbers(stale);
  });

  it('insufficient below the minimum, ok at it', async () => {
    // TODAY_MIN_BARS returns need TODAY_MIN_BARS + 1 closes.
    const low = await buildTodayResponse('bitcoin', deps({ candles: bars(TODAY_MIN_BARS, 30) }));
    assert.equal(low.status, 'unavailable');
    if (low.status === 'unavailable') assert.equal(low.reason, 'insufficient');
    assertNoNumbers(low);
    const enough = await buildTodayResponse(
      'bitcoin',
      deps({ candles: bars(TODAY_MIN_BARS + 1, 30) }),
    );
    assert.equal(enough.status, 'ok');
  });

  it('drops the still-open bar', async () => {
    const candles = bars(TODAY_MIN_BARS + 1, 30);
    const last = candles[candles.length - 1];
    const open: OHLCV = { ...last, openTime: NOW - 1, closeTime: NOW + HOUR };
    const res = await buildTodayResponse('bitcoin', deps({ candles: [...candles, open] }));
    assert.equal(res.status, 'ok');
    if (res.status === 'ok') {
      assert.equal(res.lastBarTs, new Date(last.closeTime).toISOString());
    }
  });

  it('missing spot is unavailable, never a fallback', async () => {
    const res = await buildTodayResponse('bitcoin', deps({ getSpot: async () => null }));
    assert.equal(res.status, 'unavailable');
    assertNoNumbers(res);
  });

  it('ok path shape', async () => {
    const res = await buildTodayResponse('ethereum', deps());
    assert.equal(res.status, 'ok');
    if (res.status !== 'ok') return;
    assert.equal(res.asset, 'ethereum');
    assert.equal(res.spot, 101);
    assert.equal(res.k, 1);
    assert.ok(res.sigmaHourly > 0);
    assert.ok(res.dayHighUtc >= res.dayLowUtc);
    assert.equal(res.track, null);
    assert.equal(typeof res.spotTs, 'string');
    assert.equal(typeof res.lastBarTs, 'string');
  });
});
