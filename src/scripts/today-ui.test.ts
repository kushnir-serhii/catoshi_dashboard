/**
 * Tests for the Today card's pure helpers (spec 024 Slice 3).
 * Run: node --import tsx --test src/scripts/today-ui.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveTodayGate } from '@/lib/todayGate';
import { closeBeyondProbability, quantiles, touchProbability } from '@/lib/todayRange';
import {
  bandLayout,
  formatAge,
  formatChipPct,
  formatProbability,
  formatTimeLeft,
  formatTrackLine,
  isTodayTracked,
  levelFromPct,
  levelSide,
  parseLevel,
  resolveHorizon,
} from '@/lib/todayUi';

describe('resolveTodayGate', () => {
  const gate = (verdict: 'A' | 'B' | 'C' | null, preview: boolean, isProduction: boolean) =>
    resolveTodayGate({ verdict, preview, isProduction });

  it('hides everything in production until a verdict is recorded', () => {
    assert.deepEqual(gate(null, false, true), { mode: 'hidden', isPreview: false });
    assert.deepEqual(gate(null, true, true), { mode: 'hidden', isPreview: false });
  });
  it('A = full, B = band only, C = nothing', () => {
    assert.equal(gate('A', false, true).mode, 'full');
    assert.equal(gate('B', false, true).mode, 'band');
    assert.equal(gate('C', false, true).mode, 'hidden');
  });
  it('preview flag renders the full card with a badge, dev only, only without a verdict', () => {
    assert.deepEqual(gate(null, true, false), { mode: 'full', isPreview: true });
    assert.deepEqual(gate(null, false, false), { mode: 'hidden', isPreview: false });
    assert.equal(gate('C', true, false).mode, 'hidden');
    assert.equal(gate('B', true, false).isPreview, false);
  });
});

describe('formatProbability', () => {
  it('rounds to integers', () => {
    assert.equal(formatProbability(0.384), '38%');
    assert.equal(formatProbability(0.5), '50%');
  });
  it('uses <1% and >99% at the ends, never 0% or 100%', () => {
    assert.equal(formatProbability(0), '<1%');
    assert.equal(formatProbability(0.004), '<1%');
    assert.equal(formatProbability(0.995), '>99%');
    assert.equal(formatProbability(1), '>99%');
    assert.equal(formatProbability(0.01), '1%');
    assert.equal(formatProbability(0.99), '99%');
  });
  it('shows 100% only for touch at spot', () => {
    assert.equal(formatProbability(1, { touchAtSpot: true }), '100%');
  });
  it('renders non-finite as a dash', () => {
    assert.equal(formatProbability(NaN), '—');
  });
});

describe('time and price formatting', () => {
  it('formatTimeLeft', () => {
    assert.equal(formatTimeLeft(10 + 34 / 60 + 0.001), '10h 34m');
    assert.equal(formatTimeLeft(0.7), '42m');
    assert.equal(formatTimeLeft(-1), '0m');
  });
  it('formatAge', () => {
    assert.equal(formatAge(40_000), '40s ago');
    assert.equal(formatAge(180_000), '3m ago');
    assert.equal(formatAge(2 * 3_600_000), '2h ago');
    assert.equal(formatAge(-5000), 'just now');
  });
  it('parseLevel', () => {
    assert.equal(parseLevel('2,760.5'), 2760.5);
    assert.equal(parseLevel('$2760'), 2760);
    assert.equal(parseLevel(''), null);
    assert.equal(parseLevel('abc'), null);
    assert.equal(parseLevel('-5'), null);
    assert.equal(parseLevel('0'), null);
  });
  it('level chips', () => {
    assert.equal(formatChipPct(-2), '−2%');
    assert.equal(formatChipPct(1), '+1%');
    assert.ok(Math.abs(levelFromPct(2000, 1) - 2020) < 1e-9);
    assert.ok(Math.abs(levelFromPct(2000, -2) - 1960) < 1e-9);
  });
  it('levelSide', () => {
    assert.equal(levelSide(100, 101), 'above');
    assert.equal(levelSide(100, 99), 'below');
    assert.equal(levelSide(100, 100), 'at');
  });
  it('isTodayTracked covers BTC/ETH/SOL only', () => {
    assert.ok(isTodayTracked('bitcoin') && isTodayTracked('ethereum') && isTodayTracked('solana'));
    assert.equal(isTodayTracked('dogecoin'), false);
  });
});

describe('resolveHorizon', () => {
  it('keeps the selection with time left', () => {
    assert.deepEqual(resolveHorizon('rest', 10), {
      horizon: 'rest',
      hoursT: 10,
      restDisabled: false,
    });
    assert.equal(resolveHorizon('24h', 10).hoursT, 24);
  });
  it('forces Next 24h and disables rest under the minimum', () => {
    const r = resolveHorizon('rest', 0.5);
    assert.equal(r.horizon, '24h');
    assert.equal(r.hoursT, 24);
    assert.equal(r.restDisabled, true);
  });
  it('exactly the minimum is still usable', () => {
    assert.equal(resolveHorizon('rest', 1).restDisabled, false);
  });
});

describe('bandLayout', () => {
  const q = quantiles(100, 0.01, 24);
  it('orders the band and keeps it inside the bar', () => {
    const l = bandLayout(q, 100, null);
    assert.ok(l.p05 > 0 && l.p05 < l.p25 && l.p25 < l.p75 && l.p75 < l.p95 && l.p95 < 100);
    assert.ok(l.spot > l.p25 && l.spot < l.p75);
    assert.equal(l.level, null);
  });
  it('places the level when in domain and drops it when outside', () => {
    assert.notEqual(bandLayout(q, 100, 102).level, null);
    assert.equal(bandLayout(q, 100, 1000).level, null);
  });
});

describe('formatTrackLine', () => {
  it('renders nothing for a null track', () => {
    assert.equal(formatTrackLine(null), null);
  });
  it('shows the build note below 14 days', () => {
    assert.equal(
      formatTrackLine({ n: 5, held90: 5 }),
      'Track record builds after 14 days (n so far: 5).',
    );
  });
  it('shows the measured line at n >= 14', () => {
    assert.equal(
      formatTrackLine({ n: 30, held90: 27 }),
      'Last 30 days: the 90% range held on 27 of 30 days.',
    );
    assert.equal(
      formatTrackLine({ n: 14, held90: 13 }),
      'Last 30 days: the 90% range held on 13 of 14 days.',
    );
  });
});

describe('level probabilities as displayed', () => {
  it('touch >= close-beyond and both fall as the level moves away', () => {
    const spot = 2700;
    const sigma = 0.004;
    let prevTouch = 2;
    let prevBeyond = 2;
    for (const pct of [0.5, 1, 2, 3, 5]) {
      const level = levelFromPct(spot, pct);
      const t = touchProbability(spot, level, sigma, 10);
      const b = closeBeyondProbability(spot, level, sigma, 10);
      assert.ok(t >= b);
      assert.ok(t <= prevTouch && b <= prevBeyond);
      prevTouch = t;
      prevBeyond = b;
    }
    assert.equal(
      formatProbability(touchProbability(spot, spot, sigma, 10), { touchAtSpot: true }),
      '100%',
    );
  });
});
