/**
 * Daily scoring for the Today Range model (spec 024 Slice 4, technical §5).
 *
 * Two isolated, non-fatal steps run from the hourly `/api/collect` pass:
 *
 *  - ISSUE: once per UTC day per tracked asset, store the model's 50%/90% band for
 *    the next 24h. `issued_at` is the run's real time floored to the hour, so the
 *    00:00 run issues at 00:00 and a run that missed 00:00 issues at its OWN hour,
 *    with its own horizon. Never backdated. Nothing is issued from stale, failed or
 *    insufficient data: the gating is `buildTodayResponse` itself, the same code
 *    the API uses, so the stored row and the displayed card can never disagree.
 *  - RESOLVE: every row whose `horizon_end` has passed gets its realized close,
 *    high and low from 1h klines and the in-band flags. A failed or incomplete
 *    kline window leaves the row unresolved. It is never guessed.
 *
 * All I/O is injected (`TodayScoringDeps`) so every branch is unit-testable with
 * fakes. The pure helpers below are exported for the same reason.
 */

import { COLLECT_ASSETS, type CollectAsset } from '@/consts/collect';
import {
  TODAY_GATE_VERDICT,
  TODAY_ISSUE_SOURCE,
  TODAY_MODEL_VERSION,
  TODAY_RESOLVE_SOURCE,
  TODAY_SCORING_HORIZON_HOURS,
  TODAY_SCORING_KLINE_LIMIT,
  TODAY_TRACK_WINDOW_DAYS,
} from '@/consts/today';
import type { SourceStatus } from '@/data/types';
import {
  describeKlineFailure,
  fetchKlines,
  type KlineFetchResult,
  type OHLCV,
} from '@/lib/collectors/binanceKlines';
import {
  type DbId,
  findAssetId,
  hasIssuedInDay,
  insertPrediction,
  listUnresolved,
  markResolved,
  type PredictionInsert,
  type PredictionResolution,
  readResolvedTrackRows,
  type ResolvedTrackRow,
  type UnresolvedPrediction,
} from '@/lib/db/todayRange';
import { buildTodayResponse, fetchLiveSpot, type TodaySpot } from '@/lib/todayApi';
import { quantiles } from '@/lib/todayRange';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/* ---------------------------------------------------------------------------
 * Pure helpers
 * ------------------------------------------------------------------------- */

export interface IssueWindow {
  issuedAt: Date;
  horizonEnd: Date;
  dayStart: Date;
  dayEnd: Date;
}

/**
 * The timing of a prediction issued by a run at `nowMs`. `issuedAt` is the run
 * time floored to the hour (the 00:00 run therefore issues at 00:00; a later run
 * issues at its own hour), and the horizon is always `issuedAt + 24h`. The day
 * bounds are the UTC day containing `issuedAt`, used for once-per-day dedupe.
 */
export function issueWindow(nowMs: number): IssueWindow {
  const issuedMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const dayStartMs = Math.floor(issuedMs / DAY_MS) * DAY_MS;
  return {
    issuedAt: new Date(issuedMs),
    horizonEnd: new Date(issuedMs + TODAY_SCORING_HORIZON_HOURS * HOUR_MS),
    dayStart: new Date(dayStartMs),
    dayEnd: new Date(dayStartMs + DAY_MS),
  };
}

export interface Realized {
  close: number;
  high: number;
  low: number;
}

/**
 * Realized close/high/low for a prediction window from 1h klines. The window is
 * the bars opening in `[issuedAt, horizonEnd)`, i.e. prices over `(issuedAt,
 * horizonEnd]`; the close is that of the last bar, the one closing at
 * `horizonEnd`. Returns `null` unless EVERY expected hourly bar is present and
 * finite: a partial window would understate the high/low, so we never guess.
 */
export function realizedFromKlines(
  candles: readonly OHLCV[],
  issuedAtMs: number,
  horizonEndMs: number,
): Realized | null {
  const hours = (horizonEndMs - issuedAtMs) / HOUR_MS;
  if (!Number.isInteger(hours) || hours <= 0) return null;

  const byOpen = new Map<number, OHLCV>();
  for (const c of candles) byOpen.set(c.openTime, c);

  let high = -Infinity;
  let low = Infinity;
  let close = NaN;
  for (let i = 0; i < hours; i += 1) {
    const bar = byOpen.get(issuedAtMs + i * HOUR_MS);
    if (
      !bar ||
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      !Number.isFinite(bar.close)
    ) {
      return null;
    }
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
    close = bar.close;
  }
  return { close, high, low };
}

/** Inclusive on both edges, the same convention as the Slice 1 backtest (`todayRangeEval`). */
export function isInBand(value: number, lo: number, hi: number): boolean {
  return value >= lo && value <= hi;
}

/** Realized values plus the two in-band flags for a stored prediction. */
export function resolvePrediction(
  row: Pick<UnresolvedPrediction, 'p05' | 'p25' | 'p75' | 'p95'>,
  realized: Realized,
  resolvedAt: Date,
): PredictionResolution {
  return {
    realizedClose: realized.close,
    realizedHigh: realized.high,
    realizedLow: realized.low,
    inBand50: isInBand(realized.close, row.p25, row.p75),
    inBand90: isInBand(realized.close, row.p05, row.p95),
    resolvedAt,
  };
}

/**
 * Track record from resolved rows: the newest `windowSize` rows of the CURRENT
 * `modelVersion` only. Rows from other versions are dropped here as well as in
 * SQL, so a caller can never mix models by accident.
 */
export function summarizeTrack(
  rows: readonly ResolvedTrackRow[],
  modelVersion: number = TODAY_MODEL_VERSION,
  windowSize: number = TODAY_TRACK_WINDOW_DAYS,
): { n: number; held90: number; held50: number } {
  const window = rows
    .filter((r) => r.modelVersion === modelVersion)
    .sort((a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime())
    .slice(0, windowSize);
  return {
    n: window.length,
    held90: window.filter((r) => r.inBand90).length,
    held50: window.filter((r) => r.inBand50).length,
  };
}

/** `track` for `/api/today` from the DB. Throws on DB failure; the caller maps that to `null`. */
export async function readTrack(
  coingeckoId: string,
): Promise<{ n: number; held90: number; held50: number }> {
  const rows = await readResolvedTrackRows(
    coingeckoId,
    TODAY_MODEL_VERSION,
    TODAY_TRACK_WINDOW_DAYS,
  );
  return summarizeTrack(rows);
}

/* ---------------------------------------------------------------------------
 * Orchestration
 * ------------------------------------------------------------------------- */

export interface TodayScoringDeps {
  now: number;
  assets: readonly CollectAsset[];
  getKlines: (pair: string, limit: number) => Promise<KlineFetchResult>;
  getSpot: (coingeckoId: string) => Promise<TodaySpot | null>;
  findAssetId: (symbol: string) => Promise<DbId | null>;
  hasIssuedInDay: (assetId: DbId, dayStart: Date, dayEnd: Date) => Promise<boolean>;
  insertPrediction: (row: PredictionInsert) => Promise<boolean>;
  listUnresolved: (now: Date) => Promise<UnresolvedPrediction[]>;
  markResolved: (id: DbId, resolution: PredictionResolution) => Promise<void>;
  /**
   * Defaults to the real `TODAY_GATE_VERDICT`. Overridable only so tests can
   * exercise the issue path under a hypothetical open gate without faking the
   * module constant; `createTodayScoringDeps` never sets this.
   */
  gateVerdict?: 'A' | 'B' | 'C' | null;
}

export interface TodayScoringResult {
  issued: number;
  resolved: number;
  sources: SourceStatus[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function issueForAsset(
  asset: CollectAsset,
  deps: TodayScoringDeps,
): Promise<{ issued: boolean; status: SourceStatus }> {
  const source = `${TODAY_ISSUE_SOURCE}:${asset.symbol}`;
  const win = issueWindow(deps.now);

  const assetId = await deps.findAssetId(asset.symbol);
  if (assetId === null) {
    return { issued: false, status: { source, ok: false, error: 'no assets row' } };
  }

  // Cheap early exit on the 23 of 24 runs that have nothing to issue: no
  // Binance/CoinGecko calls once today's row exists.
  if (await deps.hasIssuedInDay(assetId, win.dayStart, win.dayEnd)) {
    return { issued: false, status: { source, ok: true, note: 'already issued today' } };
  }

  // Same gating as the API: failed / stale / insufficient / missing spot
  // => unavailable => no row. Never issue from stale data.
  const res = await buildTodayResponse(asset.coingeckoId, {
    getKlines: deps.getKlines,
    getSpot: deps.getSpot,
    now: deps.now,
  });
  if (res.status !== 'ok') {
    const detail = res.klinesFailure ? ` (${res.klinesFailure})` : '';
    return {
      issued: false,
      status: { source, ok: false, error: `skipped: ${res.reason}${detail}` },
    };
  }

  // Price the window we will actually score: from the spot's own timestamp to
  // horizon_end (~24h; a few minutes either side depending on run latency).
  const hoursT = (win.horizonEnd.getTime() - Date.parse(res.spotTs)) / HOUR_MS;
  const q = quantiles(res.spot, res.sigmaHourly, hoursT);
  const values = [res.spot, res.sigmaHourly, res.k, q.p05, q.p25, q.p75, q.p95];
  if (!(hoursT > 0) || !values.every((v) => Number.isFinite(v))) {
    return {
      issued: false,
      status: { source, ok: false, error: 'skipped: non-finite model output' },
    };
  }

  const inserted = await deps.insertPrediction({
    assetId,
    issuedAt: win.issuedAt,
    horizonEnd: win.horizonEnd,
    dayStart: win.dayStart,
    dayEnd: win.dayEnd,
    spot: res.spot,
    sigmaHourly: res.sigmaHourly,
    k: res.k,
    modelVersion: res.modelVersion,
    p05: q.p05,
    p25: q.p25,
    p75: q.p75,
    p95: q.p95,
  });
  return {
    issued: inserted,
    status: { source, ok: true, note: inserted ? 'issued' : 'already issued today' },
  };
}

async function resolveDue(
  deps: TodayScoringDeps,
): Promise<{ resolved: number; status: SourceStatus }> {
  const due = await deps.listUnresolved(new Date(deps.now));
  if (due.length === 0) {
    return { resolved: 0, status: { source: TODAY_RESOLVE_SOURCE, ok: true, note: 'nothing due' } };
  }

  const byPair = new Map<string, UnresolvedPrediction[]>();
  for (const row of due) {
    const list = byPair.get(row.binancePair) ?? [];
    list.push(row);
    byPair.set(row.binancePair, list);
  }

  let resolved = 0;
  let pending = 0;
  const errors: string[] = [];

  for (const [pair, rows] of byPair) {
    const klines = await deps.getKlines(pair, TODAY_SCORING_KLINE_LIMIT);
    if (!klines.ok) {
      // Leave every row for this pair unresolved; retry next hour.
      pending += rows.length;
      errors.push(`${pair} klines_failed (${describeKlineFailure(klines)})`);
      continue;
    }
    for (const row of rows) {
      const realized = realizedFromKlines(
        klines.candles,
        row.issuedAt.getTime(),
        row.horizonEnd.getTime(),
      );
      if (realized === null) {
        pending += 1;
        continue;
      }
      try {
        await deps.markResolved(row.id, resolvePrediction(row, realized, new Date(deps.now)));
        resolved += 1;
      } catch (error: unknown) {
        pending += 1;
        errors.push(`${row.symbol} ${row.issuedAt.toISOString()}: ${errorMessage(error)}`);
      }
    }
  }

  const note = `resolved ${resolved}, pending ${pending}`;
  return {
    resolved,
    status:
      errors.length === 0
        ? { source: TODAY_RESOLVE_SOURCE, ok: true, note }
        : { source: TODAY_RESOLVE_SOURCE, ok: false, error: `${errors.join('; ')} | ${note}` },
  };
}

/**
 * Runs issue then resolve. Each asset and each step is isolated: a failure is
 * reported as a `SourceStatus` and never thrown, so it cannot fail the collect run.
 *
 * ISSUE is skipped entirely when `TODAY_GATE_VERDICT` is not 'A' or 'B' —
 * never write a fresh daily prediction from a model that hasn't passed (or
 * hasn't run) the Slice 1 calibration gate (functional-spec §0). RESOLVE
 * still runs, so any rows issued under a prior verdict are honestly scored
 * rather than left hanging.
 */
export async function runTodayScoring(deps: TodayScoringDeps): Promise<TodayScoringResult> {
  const sources: SourceStatus[] = [];
  let issued = 0;
  const verdict = deps.gateVerdict === undefined ? TODAY_GATE_VERDICT : deps.gateVerdict;

  if (verdict === 'A' || verdict === 'B') {
    for (const asset of deps.assets) {
      try {
        const r = await issueForAsset(asset, deps);
        if (r.issued) issued += 1;
        sources.push(r.status);
      } catch (error: unknown) {
        sources.push({
          source: `${TODAY_ISSUE_SOURCE}:${asset.symbol}`,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
  } else {
    // Matches the `NEWS_CLASSIFY_ENABLED=false` convention (spec 019 Slice 4):
    // a deliberate pause is `disabled: true`, not a failure.
    sources.push({ source: TODAY_ISSUE_SOURCE, ok: true, disabled: true });
  }

  let resolved = 0;
  try {
    const r = await resolveDue(deps);
    resolved = r.resolved;
    sources.push(r.status);
  } catch (error: unknown) {
    sources.push({ source: TODAY_RESOLVE_SOURCE, ok: false, error: errorMessage(error) });
  }

  return { issued, resolved, sources };
}

/** Production wiring: Binance 1h klines, CoinGecko spot, Postgres. */
export function createTodayScoringDeps(now: number = Date.now()): TodayScoringDeps {
  return {
    now,
    assets: COLLECT_ASSETS,
    getKlines: (pair, limit) => fetchKlines(pair, '1h', limit),
    getSpot: fetchLiveSpot,
    findAssetId,
    hasIssuedInDay,
    insertPrediction,
    listUnresolved,
    markResolved,
  };
}
