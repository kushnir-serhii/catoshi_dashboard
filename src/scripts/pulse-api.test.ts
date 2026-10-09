/**
 * Tests for the Market Pulse API contract and the backtest's no-look-ahead rule
 * (spec 027 Slice 9; functional §2.2 / §2.8, technical §7 / §8.1).
 * Run: node --import tsx --test src/scripts/pulse-api.test.ts
 *
 * No network and no database. The route tests seed `globalThis.__dbPool` with an
 * in-memory fake that answers the three queries `/api/pulse` issues, so the real
 * route, loaders and response builder run end to end on synthetic rows.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { GET } from '@/app/api/pulse/route';
import { MACRO_CALENDAR_HEALTH_WARN_DAYS, MACRO_CALENDAR_STALE_DAYS } from '@/consts/macro';
import {
  PULSE_BACKTEST_MIN_ALERTS,
  PULSE_PREV24H_TOLERANCE_HOURS,
  PULSE_SCOPES,
  PULSE_STALE_HOURS,
} from '@/consts/pulse';
import { SIGNALS_FRESHNESS_HOURS } from '@/consts/signals';
import calendarData from '@/data/macro-calendar.json';
import type { PulseResponse } from '@/data/types';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import type { PulseAttemptStatus, PulseRow } from '@/lib/db/pulse';
import { calendarAgeWarning, isCalendarStale, nextEvent } from '@/lib/macro/calendar';
import {
  binomialUpperTail,
  closedCandlesAsOf,
  macroRowsAsOf,
  marketStateRowsAsOf,
  newsRowsAsOf,
  type ReplayMarketStateRow,
  type ReplayNewsRow,
  selectRowsAsOf,
  spaceAlerts,
  verdictOf,
  worstVerdict,
} from '@/lib/pulse/backtest';
import { formatEventWhen, formatLocalTimeWithOffset, formatUtcOffset } from '@/lib/pulse/format';
import { buildPulseResponse, mockPulseResponse, parseInsufficientNote } from '@/lib/pulse/response';
import type { Signal } from '@/lib/signals/types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-09T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function pulseRow(over: Partial<PulseRow> = {}): PulseRow {
  return {
    scope: 'market',
    computedAt: new Date(NOW.getTime() - 10 * 60_000),
    bull: 40,
    bear: 15,
    value: 25,
    conflict: false,
    inputCount: 9,
    drivers: [
      { signal_id: '11', label: 'ETF inflows', display: 'ETF inflows', c: 0.7 },
      { signal_id: '12', label: 'Funding', display: 'Funding high', c: -0.4 },
    ],
    missing: ['macro'],
    modelVersion: 1,
    ...over,
  };
}

function attempt(
  minutesAfterRow: number,
  detail: string | null,
  row: PulseRow,
): PulseAttemptStatus {
  return {
    lastAttemptAt: new Date(row.computedAt.getTime() + minutesAfterRow * 60_000),
    detail,
  };
}

// ---------------------------------------------------------------------------
// buildPulseResponse: statuses
// ---------------------------------------------------------------------------

describe('buildPulseResponse statuses', () => {
  // @spec: 027-market-pulse
  it('ok carries every field of the contract', () => {
    const row = pulseRow();
    const res = buildPulseResponse(row, pulseRow({ value: -5 }), null, NOW, {
      ts: '2026-10-10T12:30:00Z',
      title: 'CPI',
    });
    assert.equal(res.status, 'ok');
    if (res.status !== 'ok') return;
    assert.equal(res.scope, 'market');
    assert.equal(res.computedAt, row.computedAt.toISOString());
    assert.equal(res.bull, 40);
    assert.equal(res.bear, 15);
    assert.equal(res.value, 25);
    assert.equal(res.conflict, false);
    assert.equal(res.inputCount, 9);
    assert.deepEqual(res.missing, ['macro']);
    assert.equal(res.prev24h, -5);
    assert.deepEqual(res.nextEvent, { ts: '2026-10-10T12:30:00Z', title: 'CPI' });
    assert.equal(res.modelVersion, 1);
    assert.deepEqual(
      res.drivers.map((d) => [d.signalId, d.sign]),
      [
        ['11', 1],
        ['12', -1],
      ],
    );
    assert.equal(typeof res.summary, 'string');
    assert.ok(res.summary.length > 0);
  });

  // @spec: 027-market-pulse
  it('ok with no 24h neighbour has prev24h null', () => {
    const res = buildPulseResponse(pulseRow(), null, null, NOW, null);
    assert.equal(res.status, 'ok');
    if (res.status === 'ok') assert.equal(res.prev24h, null);
  });

  // @spec: 027-market-pulse
  // @regression
  it('stale (row older than PULSE_STALE_HOURS) carries ONLY status and computedAt', () => {
    const row = pulseRow({
      computedAt: new Date(NOW.getTime() - (PULSE_STALE_HOURS * HOUR + 60_000)),
    });
    const res = buildPulseResponse(row, pulseRow({ value: 3 }), null, NOW, null);
    assert.deepEqual(res, { status: 'stale', computedAt: row.computedAt.toISOString() });
    assert.deepEqual(Object.keys(res).sort(), ['computedAt', 'status']);
  });

  // @spec: 027-market-pulse
  it('a row exactly PULSE_STALE_HOURS old is still ok (stale is strictly older)', () => {
    const row = pulseRow({ computedAt: new Date(NOW.getTime() - PULSE_STALE_HOURS * HOUR) });
    assert.equal(buildPulseResponse(row, null, null, NOW, null).status, 'ok');
  });

  // @spec: 027-market-pulse
  it('insufficient: a newer note gives status and inputCount only', () => {
    const row = pulseRow();
    const res = buildPulseResponse(row, null, attempt(5, 'insufficient inputs=3', row), NOW, null);
    assert.deepEqual(res, { status: 'insufficient', inputCount: 3 });
  });

  // @spec: 027-market-pulse
  it('insufficient with no stored row at all', () => {
    const res = buildPulseResponse(
      null,
      null,
      { lastAttemptAt: NOW, detail: 'insufficient inputs=0' },
      NOW,
      null,
    );
    assert.deepEqual(res, { status: 'insufficient', inputCount: 0 });
  });

  // @spec: 027-market-pulse
  it('insufficient beats stale when the note is newer than an old row', () => {
    const row = pulseRow({ computedAt: new Date(NOW.getTime() - 6 * HOUR) });
    const res = buildPulseResponse(row, null, attempt(60, 'insufficient inputs=2', row), NOW, null);
    assert.deepEqual(res, { status: 'insufficient', inputCount: 2 });
  });

  // @spec: 027-market-pulse
  it('unavailable when there is no row and no note', () => {
    assert.deepEqual(buildPulseResponse(null, null, null, NOW, null), { status: 'unavailable' });
  });

  // @spec: 027-market-pulse
  it('unavailable when there is no row and the note is not an insufficient note', () => {
    const res = buildPulseResponse(null, null, { lastAttemptAt: NOW, detail: 'ok' }, NOW, null);
    assert.deepEqual(res, { status: 'unavailable' });
  });

  // @spec: 027-market-pulse
  // @regression
  it('an older insufficient note does not override a newer ok row', () => {
    const row = pulseRow();
    const res = buildPulseResponse(
      row,
      null,
      attempt(-30, 'insufficient inputs=1', row),
      NOW,
      null,
    );
    assert.equal(res.status, 'ok');
  });

  // @spec: 027-market-pulse
  it('a non-insufficient note with a newer attempt leaves the ok row alone', () => {
    const row = pulseRow();
    assert.equal(buildPulseResponse(row, null, attempt(5, null, row), NOW, null).status, 'ok');
  });

  // @spec: 027-market-pulse
  it('parseInsufficientNote accepts only the exact note shape', () => {
    assert.equal(parseInsufficientNote('insufficient inputs=4'), 4);
    assert.equal(parseInsufficientNote('  insufficient inputs=12 '), 12);
    assert.equal(parseInsufficientNote('insufficient inputs=x'), null);
    assert.equal(parseInsufficientNote('computed ok'), null);
    assert.equal(parseInsufficientNote(null), null);
  });

  // @spec: 027-market-pulse
  it('mockPulseResponse is ok for every scope', () => {
    for (const scope of PULSE_SCOPES) {
      const res = mockPulseResponse(scope);
      assert.equal(res.status, 'ok');
      if (res.status === 'ok') assert.equal(res.scope, scope);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/pulse: scope parsing, statuses and prev24h through the real route
// ---------------------------------------------------------------------------

interface FakeDb {
  rows: PulseRow[];
  attempt: PulseAttemptStatus | null;
}

function installFakePool(db: FakeDb): void {
  const toDb = (r: PulseRow) => ({
    scope: r.scope,
    computed_at: r.computedAt,
    bull: r.bull,
    bear: r.bear,
    value: r.value,
    conflict: r.conflict,
    input_count: r.inputCount,
    drivers: r.drivers,
    missing: r.missing,
    model_version: r.modelVersion,
  });
  const fake = {
    async query(text: string, params: unknown[] = []) {
      if (text.includes('collector_status')) {
        return {
          rows: db.attempt
            ? [{ last_attempt_at: db.attempt.lastAttemptAt, detail: db.attempt.detail }]
            : [],
        };
      }
      const scoped = db.rows.filter((r) => r.scope === params[0]);
      if (text.includes('between')) {
        const [, lo, hi, ts] = params as [string, Date, Date, Date];
        const inWindow = scoped
          .filter((r) => r.computedAt >= lo && r.computedAt <= hi)
          .sort(
            (a, b) =>
              Math.abs(a.computedAt.getTime() - ts.getTime()) -
              Math.abs(b.computedAt.getTime() - ts.getTime()),
          );
        return { rows: inWindow.slice(0, 1).map(toDb) };
      }
      if (text.includes('order by computed_at desc limit 1')) {
        const newest = [...scoped].sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());
        return { rows: newest.slice(0, 1).map(toDb) };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  (globalThis as { __dbPool?: unknown }).__dbPool = fake;
}

async function callRoute(scope: string | null): Promise<{ status: number; body: unknown }> {
  const url = scope === null ? 'http://t/api/pulse' : `http://t/api/pulse?scope=${scope}`;
  const res = await GET(new Request(url));
  return { status: res.status, body: await res.json() };
}

describe('GET /api/pulse', () => {
  const savedMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA;
  const savedPool = (globalThis as { __dbPool?: unknown }).__dbPool;
  const db: FakeDb = { rows: [], attempt: null };

  beforeEach(() => {
    db.rows = [];
    db.attempt = null;
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
    installFakePool(db);
  });

  afterEach(() => {
    if (savedMock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA;
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = savedMock;
    (globalThis as { __dbPool?: unknown }).__dbPool = savedPool;
  });

  // @spec: 027-market-pulse
  // @regression
  it('answers 400 for an unknown, wrongly cased, empty or missing scope', async () => {
    for (const scope of ['bogus', 'eth', 'btc', 'Market', '', null]) {
      const { status, body } = await callRoute(scope);
      assert.equal(status, 400, `scope ${JSON.stringify(scope)}`);
      assert.match((body as { error: string }).error, /scope must be one of/);
    }
  });

  // @spec: 027-market-pulse
  it('accepts market, BTC, ETH and SOL (mock mode)', async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true';
    for (const scope of ['market', 'BTC', 'ETH', 'SOL']) {
      const { status, body } = await callRoute(scope);
      assert.equal(status, 200, scope);
      assert.equal((body as PulseResponse).status, 'ok');
      assert.equal((body as { scope: string }).scope, scope);
    }
  });

  // @spec: 027-market-pulse
  it('accepts every scope against the (fake) database and reports unavailable when empty', async () => {
    for (const scope of PULSE_SCOPES) {
      const { status, body } = await callRoute(scope);
      assert.equal(status, 200);
      assert.deepEqual(body, { status: 'unavailable' });
    }
  });

  // @spec: 027-market-pulse
  it('ok for a fresh row; scope is respected', async () => {
    db.rows = [pulseRow({ scope: 'ETH', computedAt: new Date(Date.now() - 60_000) })];
    const eth = await callRoute('ETH');
    assert.equal((eth.body as PulseResponse).status, 'ok');
    const sol = await callRoute('SOL');
    assert.deepEqual(sol.body, { status: 'unavailable' });
  });

  // @spec: 027-market-pulse
  // @regression
  it('stale row: no numeric fields on the wire', async () => {
    const computedAt = new Date(Date.now() - (PULSE_STALE_HOURS + 1) * HOUR);
    db.rows = [pulseRow({ computedAt })];
    const { body } = await callRoute('market');
    assert.deepEqual(body, { status: 'stale', computedAt: computedAt.toISOString() });
  });

  // @spec: 027-market-pulse
  it('insufficient: a newer collector note wins, an older one does not', async () => {
    const row = pulseRow({ computedAt: new Date(Date.now() - 20 * 60_000) });
    db.rows = [row];
    db.attempt = {
      lastAttemptAt: new Date(Date.now() - 5 * 60_000),
      detail: 'insufficient inputs=3',
    };
    assert.deepEqual((await callRoute('market')).body, { status: 'insufficient', inputCount: 3 });

    db.attempt = {
      lastAttemptAt: new Date(Date.now() - 40 * 60_000),
      detail: 'insufficient inputs=3',
    };
    assert.equal(((await callRoute('market')).body as PulseResponse).status, 'ok');
  });

  describe('prev24h tolerance', () => {
    const latestAt = new Date(Date.now() - 5 * 60_000);
    const at = (offsetMs: number, value: number): PulseRow =>
      pulseRow({ computedAt: new Date(latestAt.getTime() + offsetMs), value });

    async function prev24h(...others: PulseRow[]): Promise<number | null> {
      db.rows = [pulseRow({ computedAt: latestAt, value: 50 }), ...others];
      const { body } = await callRoute('market');
      const res = body as PulseResponse;
      assert.equal(res.status, 'ok');
      return res.status === 'ok' ? res.prev24h : -999;
    }

    // @spec: 027-market-pulse
    // @regression
    it('uses a row at exactly -24h', async () => {
      assert.equal(await prev24h(at(-24 * HOUR, 7)), 7);
    });

    // @spec: 027-market-pulse
    // @regression
    it('uses rows on the +/-2h edges (-22h and -26h)', async () => {
      assert.equal(await prev24h(at(-22 * HOUR, 11)), 11);
      assert.equal(await prev24h(at(-26 * HOUR, 12)), 12);
    });

    // @spec: 027-market-pulse
    // @regression
    it('ignores rows just outside the window (-21h59m, -26h01m)', async () => {
      assert.equal(await prev24h(at(-(21 * HOUR + 59 * 60_000), 1)), null);
      assert.equal(await prev24h(at(-(26 * HOUR + 60_000), 2)), null);
    });

    // @spec: 027-market-pulse
    it('the nearest of two candidates wins', async () => {
      assert.equal(await prev24h(at(-23 * HOUR, 100), at(-(24 * HOUR + 30 * 60_000), 200)), 200);
      assert.equal(await prev24h(at(-(24 * HOUR + 10 * 60_000), 300), at(-26 * HOUR, 400)), 300);
    });

    // @spec: 027-market-pulse
    it('is null when the only history is the latest row', async () => {
      assert.equal(await prev24h(), null);
    });

    // @spec: 027-market-pulse
    it('the tolerance constant is 2 hours', () => {
      assert.equal(PULSE_PREV24H_TOLERANCE_HOURS, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// Macro calendar
// ---------------------------------------------------------------------------

describe('macro calendar', () => {
  const updatedMs = Date.parse(`${calendarData.updated}T00:00:00Z`);
  const events = calendarData.events
    .map((e) => ({ ...e, ms: Date.parse(e.ts) }))
    .sort((a, b) => a.ms - b.ms);
  const first = events[0];

  // @spec: 027-market-pulse
  it('returns the next event inside the 72h lookahead', () => {
    const now = first.ms - 71 * HOUR;
    assert.equal(nextEvent(now)?.ts, first.ts);
  });

  // @spec: 027-market-pulse
  it('includes an event exactly 72h away and excludes one 1ms beyond', () => {
    assert.equal(nextEvent(first.ms - 72 * HOUR)?.ts, first.ts);
    assert.equal(nextEvent(first.ms - 72 * HOUR - 1), null);
  });

  // @spec: 027-market-pulse
  it('does not return an event that has already started', () => {
    assert.notEqual(nextEvent(first.ms)?.ts, first.ts);
  });

  // @spec: 027-market-pulse
  it('is null beyond the window', () => {
    assert.equal(nextEvent(first.ms - 100 * HOUR), null);
  });

  // @spec: 027-market-pulse
  // @regression
  it('is stale (null) when the calendar `updated` is older than 30 days', () => {
    const stale = updatedMs + (MACRO_CALENDAR_STALE_DAYS + 1) * DAY;
    assert.equal(isCalendarStale(stale), true);
    assert.equal(nextEvent(stale, 24 * 365), null);
    assert.equal(isCalendarStale(updatedMs + MACRO_CALENDAR_STALE_DAYS * DAY), false);
    assert.equal(isCalendarStale(updatedMs + MACRO_CALENDAR_STALE_DAYS * DAY + 23 * HOUR), false);
  });

  // @spec: 027-market-pulse
  it('health warning starts at 21 days of age', () => {
    assert.equal(MACRO_CALENDAR_HEALTH_WARN_DAYS, 21);
    assert.equal(calendarAgeWarning(updatedMs + 21 * DAY - 1), false);
    assert.equal(calendarAgeWarning(updatedMs + 21 * DAY), true);
    assert.equal(calendarAgeWarning(updatedMs), false);
  });
});

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

describe('pulse time formatting', () => {
  // @spec: 027-market-pulse
  it('formatUtcOffset signs follow getTimezoneOffset (west-positive)', () => {
    assert.equal(formatUtcOffset(0), 'UTC+00:00');
    assert.equal(formatUtcOffset(-120), 'UTC+02:00');
    assert.equal(formatUtcOffset(-330), 'UTC+05:30');
    assert.equal(formatUtcOffset(300), 'UTC−05:00');
  });

  // @spec: 027-market-pulse
  it('formatLocalTimeWithOffset has the HH:MM (UTC+hh:mm) shape and survives bad input', () => {
    assert.match(
      formatLocalTimeWithOffset('2026-10-14T12:30:00Z'),
      /^\d{2}:\d{2} \(UTC[+−]\d{2}:\d{2}\)$/,
    );
    assert.equal(formatLocalTimeWithOffset('not a date'), '');
  });

  // @spec: 027-market-pulse
  it('formatEventWhen says today, tomorrow, then a weekday (local time)', () => {
    const now = new Date(2026, 9, 9, 12, 0);
    assert.equal(formatEventWhen(new Date(2026, 9, 9, 20, 0).toISOString(), now), 'today 20:00');
    assert.equal(
      formatEventWhen(new Date(2026, 9, 10, 9, 30).toISOString(), now),
      'tomorrow 09:30',
    );
    assert.match(
      formatEventWhen(new Date(2026, 9, 13, 14, 0).toISOString(), now),
      /^[A-Z][a-z]{2} 14:00$/,
    );
    assert.equal(formatEventWhen('nope', now), '');
  });
});

// ---------------------------------------------------------------------------
// Backtest: no look-ahead (technical §8.1)
// ---------------------------------------------------------------------------

const H = Date.parse('2026-10-05T12:00:00.000Z');

function signal(ruleId: string): Signal {
  return {
    ruleId,
    tag: 'BEARISH',
    title: `${ruleId} fired`,
    body: 'body',
    source: 'test',
    severity: 0.6,
  };
}

function msRow(
  snapshotMs: number,
  ruleId = 'rsi_1d_overbought',
  asset: 'BTC' | 'ETH' = 'BTC',
): ReplayMarketStateRow {
  return { asset, snapshotMs, signal: signal(ruleId) };
}

function newsRow(over: Partial<ReplayNewsRow> = {}): ReplayNewsRow {
  return {
    id: 'n1',
    asset: 'BTC',
    tag: 'BEARISH',
    severity: 0.7,
    title: 'headline',
    body: 'body',
    clusterId: 'c1',
    createdMs: H - 2 * HOUR,
    publishedMs: H - 3 * HOUR,
    expiresMs: H + 5 * HOUR,
    classifications: [
      { createdMs: H - 2 * HOUR, magnitude: 'MEDIUM', horizonHours: 24, contentType: 'event' },
    ],
    ...over,
  };
}

function candle(index: number): OHLCV {
  const openTime = index * 4 * HOUR;
  return {
    openTime,
    open: 100,
    high: 101,
    low: 99,
    close: 100 + index,
    volume: 1,
    closeTime: openTime + 4 * HOUR - 1,
  };
}

describe('backtest no-look-ahead', () => {
  describe('news rows', () => {
    // @spec: 027-market-pulse
    // @regression
    it('excludes a news signal created after H', () => {
      const late = newsRow({ id: 'late', createdMs: H + 1 });
      const ok = newsRow({ id: 'ok' });
      assert.deepEqual(
        newsRowsAsOf([late, ok], H).map((r) => r.id),
        ['ok'],
      );
    });

    // @spec: 027-market-pulse
    it('includes a news signal created exactly at H', () => {
      assert.equal(newsRowsAsOf([newsRow({ createdMs: H })], H).length, 1);
    });

    // @spec: 027-market-pulse
    it('excludes an article published after H', () => {
      assert.equal(newsRowsAsOf([newsRow({ publishedMs: H + 1 })], H).length, 0);
    });

    // @spec: 027-market-pulse
    // @regression
    it('uses the older classification when the newer one was created after H', () => {
      const row = newsRow({
        classifications: [
          { createdMs: H - 2 * HOUR, magnitude: 'LOW', horizonHours: 12, contentType: null },
          { createdMs: H + HOUR, magnitude: 'HIGH', horizonHours: 72, contentType: 'event' },
        ],
      });
      const [out] = newsRowsAsOf([row], H);
      assert.equal(out.magnitude, 'LOW');
      assert.equal(out.horizonHours, 12);
      assert.equal(out.contentType, null);
    });

    // @spec: 027-market-pulse
    it('uses the newest classification created at or before H', () => {
      const row = newsRow({
        classifications: [
          { createdMs: H - 3 * HOUR, magnitude: 'LOW', horizonHours: 12, contentType: null },
          { createdMs: H, magnitude: 'HIGH', horizonHours: 72, contentType: 'event' },
        ],
      });
      assert.equal(newsRowsAsOf([row], H)[0].magnitude, 'HIGH');
    });

    // @spec: 027-market-pulse
    it('drops a row whose only classification was created after H', () => {
      const row = newsRow({
        classifications: [
          { createdMs: H + 1, magnitude: 'HIGH', horizonHours: 72, contentType: 'event' },
        ],
      });
      assert.equal(newsRowsAsOf([row], H).length, 0);
    });

    // @spec: 027-market-pulse
    // @regression
    it('excludes a row at or past expires_at', () => {
      assert.equal(newsRowsAsOf([newsRow({ expiresMs: H })], H).length, 0);
      assert.equal(newsRowsAsOf([newsRow({ expiresMs: H - HOUR })], H).length, 0);
      assert.equal(newsRowsAsOf([newsRow({ expiresMs: H + 1 })], H).length, 1);
    });
  });

  describe('market-state rows', () => {
    // @spec: 027-market-pulse
    // @regression
    it('excludes a snapshot after H', () => {
      assert.equal(marketStateRowsAsOf([msRow(H + 1)], H).length, 0);
      assert.equal(marketStateRowsAsOf([msRow(H)], H).length, 1);
    });

    // @spec: 027-market-pulse
    it('excludes a snapshot older than the freshness window', () => {
      const edge = H - SIGNALS_FRESHNESS_HOURS * HOUR;
      assert.equal(marketStateRowsAsOf([msRow(edge)], H).length, 0);
      assert.equal(marketStateRowsAsOf([msRow(edge - HOUR)], H).length, 0);
      assert.equal(marketStateRowsAsOf([msRow(edge + 1)], H).length, 1);
    });

    // @spec: 027-market-pulse
    it('keeps only the newest row per (asset, rule)', () => {
      const out = marketStateRowsAsOf(
        [msRow(H - 2 * HOUR), msRow(H - HOUR), msRow(H - HOUR, 'rsi_1d_overbought', 'ETH')],
        H,
      );
      assert.equal(out.length, 2);
      assert.ok(out.some((r) => r.id.endsWith(String(H - HOUR)) && r.asset === 'BTC'));
    });
  });

  describe('macro rows', () => {
    // 10Y +10bp on 2026-10-05 (>= 8bp threshold); the day ends at 2026-10-06T00:00Z.
    const readings = {
      DGS10: [
        { obsDate: '2026-10-04', value: 4.0 },
        { obsDate: '2026-10-05', value: 4.1 },
      ],
    };
    const dayEnd = Date.parse('2026-10-06T00:00:00Z');

    // @spec: 027-market-pulse
    // @regression
    it('excludes a reading whose observation day has not ended by H', () => {
      assert.equal(macroRowsAsOf(readings, dayEnd - 1).length, 0);
      assert.equal(macroRowsAsOf(readings, Date.parse('2026-10-05T12:00:00Z')).length, 0);
    });

    // @spec: 027-market-pulse
    it('includes it once the day has ended', () => {
      const out = macroRowsAsOf(readings, dayEnd);
      assert.deepEqual(
        out.map((r) => r.ruleId),
        ['macro_10y'],
      );
    });

    // @spec: 027-market-pulse
    it('never sees a later reading', () => {
      const withFuture = {
        DGS10: [...readings.DGS10, { obsDate: '2026-10-09', value: 9.9 }],
      };
      const out = macroRowsAsOf(withFuture, dayEnd);
      assert.equal(out.length, 1);
      assert.match(out[0].body, /4\.10%/);
    });
  });

  describe('4h candles', () => {
    const candles = [0, 1, 2, 3, 4].map(candle);

    // @spec: 027-market-pulse
    // @regression
    it('excludes a candle whose closeTime is at or after H', () => {
      // candle 2 closes at 12h - 1ms (closed by H = 12h); candle 3 is still open.
      const out = closedCandlesAsOf(candles, 12 * HOUR, 10);
      assert.deepEqual(
        out.map((c) => c.openTime),
        [0, 4 * HOUR, 8 * HOUR],
      );
      const exact = closedCandlesAsOf(candles, 12 * HOUR - 1, 10);
      assert.deepEqual(
        exact.map((c) => c.openTime),
        [0, 4 * HOUR],
      );
    });

    // @spec: 027-market-pulse
    it('keeps the last `limit` closed candles', () => {
      const out = closedCandlesAsOf(candles, 20 * HOUR, 2);
      assert.deepEqual(
        out.map((c) => c.openTime),
        [12 * HOUR, 16 * HOUR],
      );
    });
  });

  // @spec: 027-market-pulse
  // @regression
  it('selectRowsAsOf combines the kinds without leaking later rows', () => {
    const pool = {
      marketState: [msRow(H - HOUR), msRow(H + HOUR, 'rsi_4h_extreme')],
      news: [newsRow({ id: 'in' }), newsRow({ id: 'late', createdMs: H + 1 })],
      macro: {},
    };
    const rows = selectRowsAsOf(pool, H, { includeNews: true });
    assert.deepEqual(rows.map((r) => r.kind).sort(), ['market_state', 'news']);
    assert.ok(rows.every((r) => r.id === 'in' || r.kind === 'market_state'));
    assert.ok(!rows.some((r) => r.id.includes(String(H + HOUR))));

    const marketOnly = selectRowsAsOf(pool, H, { includeNews: false });
    assert.deepEqual(
      marketOnly.map((r) => r.kind),
      ['market_state'],
    );
  });
});

// ---------------------------------------------------------------------------
// Backtest statistics and verdicts
// ---------------------------------------------------------------------------

describe('backtest statistics', () => {
  // @spec: 027-market-pulse
  it('spaceAlerts keeps alerts at least 72h apart', () => {
    const alerts = [0, 10, 71, 72, 100, 144].map((h) => ({ atMs: h * HOUR }));
    const { kept, dropped } = spaceAlerts(alerts, 72);
    assert.deepEqual(
      kept.map((a) => a.atMs / HOUR),
      [0, 72, 144],
    );
    assert.equal(dropped, 3);
  });

  // @spec: 027-market-pulse
  it('binomialUpperTail(3, 10, 0.2) is about 0.3222', () => {
    assert.ok(Math.abs(binomialUpperTail(3, 10, 0.2) - 0.3222) < 1e-4);
  });

  // @spec: 027-market-pulse
  it('binomialUpperTail edge cases', () => {
    assert.equal(binomialUpperTail(0, 10, 0.2), 1);
    assert.equal(binomialUpperTail(11, 10, 0.2), 0);
    assert.ok(Math.abs(binomialUpperTail(10, 10, 0.5) - 1 / 1024) < 1e-12);
  });

  // @spec: 027-market-pulse
  it('verdict: n < 10 is B, n >= 10 with p < 0.10 is A, otherwise C', () => {
    assert.equal(verdictOf(PULSE_BACKTEST_MIN_ALERTS - 1, 0.001), 'B');
    assert.equal(verdictOf(0, null), 'B');
    assert.equal(verdictOf(PULSE_BACKTEST_MIN_ALERTS, 0.09), 'A');
    assert.equal(verdictOf(PULSE_BACKTEST_MIN_ALERTS, 0.1), 'C');
    assert.equal(verdictOf(40, 0.5), 'C');
  });

  // @spec: 027-market-pulse
  it('worstVerdict ranks C over B over A, and B for nothing', () => {
    assert.equal(worstVerdict(['A', 'A']), 'A');
    assert.equal(worstVerdict(['A', 'B']), 'B');
    assert.equal(worstVerdict(['A', 'B', 'C']), 'C');
    assert.equal(worstVerdict([]), 'B');
  });
});
