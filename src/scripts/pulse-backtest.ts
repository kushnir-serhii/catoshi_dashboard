/**
 * Spec 027 Slice 6 — THE GATE: Market Pulse backtest (functional §2.8, technical §8.1).
 * ======================================================================================
 *
 * I/O ONLY. Row selection (no look-ahead), the Pulse/decision replay, outcomes,
 * base rates, statistics and verdicts live in `src/lib/pulse/backtest.ts`; the
 * markdown in `src/lib/pulse/backtest-report.ts`. This file loads rows, calls them
 * and writes files.
 *
 * Run FROM THE REPO ROOT:
 *   npm run pulse-backtest                       (all live-collected history)
 *   npm run pulse-backtest -- --days 30          (last 30 days only)
 *   npx tsx --env-file=.env.local src/scripts/pulse-backtest.ts --days 2   (local smoke run)
 *
 * READ-ONLY. Every statement below is a SELECT. It writes nothing to the database:
 * no market_pulse rows, no signals, no notifications. It needs DATABASE_URL only to read.
 *
 * Data, loaded once for the window and sliced in memory (no per-hour queries):
 *   - `snapshots` for BTC/ETH/SOL (without the `raw` payload; rules never read it).
 *     Only live-collected hours (`raw->>'backfill'` not true) are replayed and priced.
 *   - `signals` (kind = 'news') joined to `news_items`, plus every
 *     `news_classifications` row of those items.
 *   - `macro_readings` for the macro rule series.
 *   - 4h klines for `history4h` (the `range_break` rule). Snapshots carry no 4h OHLC,
 *     and rebuilding 4h highs/lows from hourly point prices would miss the wicks the
 *     rule tests, so the klines come from Binance **spot** history
 *     (`data-api.binance.vision`, `BINANCE_SPOT_HISTORY_HOSTS`): the live collector
 *     reads USDT-M futures (`fapi.binance.com`), which answers HTTP 451 to GitHub
 *     runners. Spot and perp track within a small basis; a real but small source
 *     difference, noted in the report. No look-ahead: an hour sees only candles with
 *     `closeTime < hour` (`closedCandlesAsOf`), the same filter the live run applies.
 *     A failed kline fetch aborts the run: a verdict on partial data is worse than none.
 *
 * Outputs (`.cache/pulse-backtest/out/`): `pulse-backtest-report.md`,
 * `pulse-backtest-results.json`. Stdout ends with the verdict and a paste-ready
 * `PULSE_BACKTEST_N`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BINANCE_SPOT_HISTORY_HOSTS, COLLECT_ASSETS } from '@/consts/collect';
import { MACRO_RULE_SERIES } from '@/consts/macro';
import {
  PULSE_BACKTEST_HORIZON_HOURS,
  PULSE_BACKTEST_MARKET_ASSET,
  PULSE_BACKTEST_MIN_ALERTS,
  PULSE_BACKTEST_MOVE_PCT,
  PULSE_BACKTEST_P_MAX,
  PULSE_SCOPES,
  type PulseAlertType,
} from '@/consts/pulse';
import { SIGNALS_FRESHNESS_HOURS, SIGNALS_HISTORY_4H_LIMIT, TRACKED_COINS } from '@/consts/signals';
import type { MarketSnapshot, PulseScope } from '@/data/types';
import type { OHLCV } from '@/lib/collectors/binanceKlines';
import { fromSnapshotRow } from '@/lib/db/analytics';
import { getPool, query } from '@/lib/db/client';
import {
  type BaseRate,
  baseRateOf,
  buildPriceSeries,
  closedCandlesAsOf,
  type PriceSeries,
  type ReplayClassification,
  type ReplayMarketStateRow,
  type ReplayNewsRow,
  type ReplayPool,
  replayPulse,
  runRulesAt,
  scoreAlerts,
  type ScoredAlert,
  worstVerdict,
} from '@/lib/pulse/backtest';
import {
  type BacktestReport,
  type BacktestVariantReport,
  renderBacktestReport,
} from '@/lib/pulse/backtest-report';
import type { PulseAsset } from '@/lib/pulse/compute';
import type { MacroReading } from '@/lib/signals/macro/types';
import type { SignalTag } from '@/lib/signals/types';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FOUR_HOURS_MS = 4 * HOUR_MS;
/** Snapshots loaded before the window so the first hours have a `previous`. */
const PREVIOUS_BUFFER_MS = 7 * DAY_MS;
const KLINE_PAGE_LIMIT = 1000;
const REQUEST_SPACING_MS = 150;
const RATE_LIMIT_BACKOFF_MS = 5000;

const OUT_DIR = join(process.cwd(), '.cache', 'pulse-backtest', 'out');

const args = process.argv.slice(2);
const argVal = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DAYS_ARG = argVal('days');
const DAYS = DAYS_ARG === null ? null : parseInt(DAYS_ARG, 10);

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

function asAsset(symbol: string | null): PulseAsset | null {
  return (TRACKED_COINS as readonly string[]).includes(symbol ?? '')
    ? (symbol as PulseAsset)
    : null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Database (SELECT only)
// ---------------------------------------------------------------------------

interface LoadedSnapshot {
  asset: PulseAsset;
  ms: number;
  isBackfill: boolean;
  snapshot: MarketSnapshot;
}

async function loadSnapshots(fromMs: number | null): Promise<LoadedSnapshot[]> {
  // `to_jsonb(s) - 'raw'`: every column the rules read, without the raw payload.
  const rows = await query<{ row: Record<string, unknown>; symbol: string; is_backfill: boolean }>(
    `select to_jsonb(s) - 'raw' as row,
            a.symbol,
            coalesce((s.raw->>'backfill')::boolean, false) as is_backfill
       from public.snapshots s
       join public.assets a on a.id = s.asset_id
      where ($1::timestamptz is null or s.ts >= $1::timestamptz)
      order by s.ts`,
    [fromMs === null ? null : new Date(fromMs).toISOString()],
  );
  const out: LoadedSnapshot[] = [];
  for (const r of rows) {
    const asset = asAsset(r.symbol);
    if (!asset) continue;
    const snapshot = fromSnapshotRow({ ...r.row, raw: {} });
    out.push({ asset, ms: Date.parse(snapshot.ts), isBackfill: r.is_backfill, snapshot });
  }
  return out;
}

async function loadNews(fromMs: number): Promise<ReplayNewsRow[]> {
  const from = new Date(fromMs).toISOString();
  const [signals, classifications] = await Promise.all([
    query<{
      id: string;
      symbol: string | null;
      tag: SignalTag;
      severity: number;
      title: string;
      body: string;
      cluster_id: string;
      created_at: Date;
      published_at: Date;
      expires_at: Date;
    }>(
      `select s.id, a.symbol, s.tag, s.severity, s.title, s.body,
              coalesce(ni.cluster_id, ni.id) as cluster_id,
              s.created_at, ni.published_at, s.expires_at
         from public.signals s
         join public.news_items ni on ni.id = s.news_item_id
         left join public.assets a on a.id = s.asset_id
        where s.kind = 'news' and s.expires_at > $1::timestamptz`,
      [from],
    ),
    query<{
      signal_id: string;
      created_at: Date;
      magnitude: ReplayClassification['magnitude'];
      horizon_hours: number;
      content_type: ReplayClassification['contentType'];
    }>(
      `select s.id as signal_id, nc.created_at, nc.magnitude, nc.horizon_hours, nc.content_type
         from public.news_classifications nc
         join public.signals s on s.news_item_id = nc.news_item_id and s.kind = 'news'
        where s.expires_at > $1::timestamptz`,
      [from],
    ),
  ]);

  const bySignal = new Map<string, ReplayClassification[]>();
  for (const c of classifications) {
    const list = bySignal.get(c.signal_id) ?? [];
    list.push({
      createdMs: new Date(c.created_at).getTime(),
      magnitude: c.magnitude,
      horizonHours: c.horizon_hours,
      contentType: c.content_type,
    });
    bySignal.set(c.signal_id, list);
  }
  return signals.map((s) => ({
    id: s.id,
    asset: asAsset(s.symbol),
    tag: s.tag,
    severity: s.severity,
    title: s.title,
    body: s.body,
    clusterId: s.cluster_id,
    createdMs: new Date(s.created_at).getTime(),
    publishedMs: new Date(s.published_at).getTime(),
    expiresMs: new Date(s.expires_at).getTime(),
    classifications: bySignal.get(s.id) ?? [],
  }));
}

async function loadMacro(): Promise<Record<string, MacroReading[]>> {
  const series = [...new Set(Object.values(MACRO_RULE_SERIES))];
  const rows = await query<{ series: string; obs_date: string; value: string }>(
    `select series, obs_date::text as obs_date, value::text as value
       from public.macro_readings
      where series = any($1::text[])`,
    [series],
  );
  const out: Record<string, MacroReading[]> = {};
  for (const r of rows)
    (out[r.series] ??= []).push({ obsDate: r.obs_date, value: Number(r.value) });
  return out;
}

// ---------------------------------------------------------------------------
// 4h klines (Binance spot history; see the file header)
// ---------------------------------------------------------------------------

async function fetchHistoryPage(path: string): Promise<unknown[]> {
  let lastErr: unknown;
  for (const host of BINANCE_SPOT_HISTORY_HOSTS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(host + path);
        if (res.status === 429 || res.status === 418) {
          await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as unknown[];
      } catch (err: unknown) {
        lastErr = err;
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw new Error(`history fetch failed for ${path}: ${String(lastErr)}`);
}

async function fetchKlines4h(pair: string, startTime: number, endTime: number): Promise<OHLCV[]> {
  const out: OHLCV[] = [];
  let cursor = startTime;
  for (;;) {
    const rows = (await fetchHistoryPage(
      `/api/v3/klines?symbol=${pair}&interval=4h&startTime=${cursor}&endTime=${endTime}&limit=${KLINE_PAGE_LIMIT}`,
    )) as (string | number)[][];
    if (!rows.length) break;
    for (const r of rows) {
      out.push({
        openTime: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
        closeTime: Number(r[6]),
      });
    }
    if (rows.length < KLINE_PAGE_LIMIT) break;
    cursor = Number(rows[rows.length - 1][0]) + 1;
    await sleep(REQUEST_SPACING_MS);
  }
  return out.sort((a, b) => a.openTime - b.openTime);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** `{ market: { bear_confluence: n, ... }, BTC: ... }` from the full variant's cells. */
function backtestN(
  cells: BacktestVariantReport['cells'],
): Partial<Record<PulseScope, Partial<Record<PulseAlertType, number>>>> {
  const out: Partial<Record<PulseScope, Partial<Record<PulseAlertType, number>>>> = {};
  for (const c of cells) (out[c.scope] ??= {})[c.type] = c.n;
  return out;
}

async function main(): Promise<void> {
  if (DAYS !== null && (!Number.isFinite(DAYS) || DAYS < 1)) {
    fail(`--days must be a whole number >= 1 (got ${DAYS_ARG})`);
  }
  const nowMs = Date.now();
  const windowStartArg =
    DAYS === null ? null : Math.floor(nowMs / HOUR_MS) * HOUR_MS - DAYS * DAY_MS;

  console.log('\n=== MARKET PULSE BACKTEST GATE (read-only) ===');
  console.log(
    `days=${DAYS ?? 'all'} horizon=${PULSE_BACKTEST_HORIZON_HOURS}h move=${PULSE_BACKTEST_MOVE_PCT}%\n`,
  );

  // One load per table for the whole window.
  const snapshots = await loadSnapshots(
    windowStartArg === null ? null : windowStartArg - PREVIOUS_BUFFER_MS,
  );
  const live = snapshots.filter((s) => !s.isBackfill);
  if (live.length === 0) fail('no live-collected snapshots in the window');
  const windowStartMs = Math.max(windowStartArg ?? -Infinity, Math.min(...live.map((s) => s.ms)));
  const hoursMs = [...new Set(live.filter((s) => s.ms >= windowStartMs).map((s) => s.ms))].sort(
    (a, b) => a - b,
  );
  const windowEndMs = hoursMs.at(-1)!;
  const [news, macro] = await Promise.all([loadNews(windowStartMs), loadMacro()]);
  console.log(
    `  snapshots loaded ${snapshots.length} (live ${live.length}, backfill ${snapshots.length - live.length}); ` +
      `news signal rows ${news.length}; macro readings ${Object.values(macro).reduce((n, r) => n + r.length, 0)}`,
  );

  // Rule replay per asset over its live snapshots (with the freshness lead-in).
  const ruleFromMs = windowStartMs - SIGNALS_FRESHNESS_HOURS * HOUR_MS;
  const firstLoadedMs = snapshots[0].ms;
  const marketState: ReplayMarketStateRow[] = [];
  const ruleFailures = new Map<string, number>();
  for (const asset of TRACKED_COINS) {
    const meta = COLLECT_ASSETS.find((a) => a.symbol === asset);
    if (!meta) fail(`no Binance pair for ${asset}`);
    let klines: OHLCV[];
    try {
      // Strictly sequential per asset, as the precedent backtests.
      klines = await fetchKlines4h(
        meta.binancePair,
        Math.min(firstLoadedMs, ruleFromMs) - (SIGNALS_HISTORY_4H_LIMIT + 1) * FOUR_HOURS_MS,
        nowMs,
      );
    } catch (err: unknown) {
      fail(`${asset}: 4h kline fetch failed — ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log(`  ${asset}: ${klines.length} 4h candles (spot)`);

    const own = snapshots.filter((s) => s.asset === asset);
    for (let i = 0; i < own.length; i += 1) {
      const s = own[i];
      if (s.isBackfill || s.ms < ruleFromMs) continue;
      const previous = i > 0 ? own[i - 1].snapshot : null;
      const history4h = closedCandlesAsOf(klines, s.ms, SIGNALS_HISTORY_4H_LIMIT);
      const { signals, failures } = runRulesAt(s.snapshot, previous, history4h);
      for (const signal of signals) marketState.push({ asset, snapshotMs: s.ms, signal });
      for (const ruleId of failures) ruleFailures.set(ruleId, (ruleFailures.get(ruleId) ?? 0) + 1);
    }
  }

  const pool: ReplayPool = { marketState, news, macro };

  // Price series per scope: the scope's own live closes; market uses BTC.
  const closesOf = (asset: string): PriceSeries =>
    buildPriceSeries(
      live.filter((s) => s.asset === asset).map((s) => ({ ms: s.ms, price: s.snapshot.price })),
    );
  const priceByScope = Object.fromEntries(
    PULSE_SCOPES.map((scope) => [
      scope,
      closesOf(scope === 'market' ? PULSE_BACKTEST_MARKET_ASSET : scope),
    ]),
  ) as Record<PulseScope, PriceSeries>;
  const baseRates = Object.fromEntries(
    PULSE_SCOPES.map((scope) => [
      scope,
      baseRateOf(
        priceByScope[scope],
        hoursMs,
        PULSE_BACKTEST_HORIZON_HOURS,
        PULSE_BACKTEST_MOVE_PCT,
      ),
    ]),
  ) as Record<PulseScope, BaseRate>;

  const scoreConfig = {
    horizonHours: PULSE_BACKTEST_HORIZON_HOURS,
    movePct: PULSE_BACKTEST_MOVE_PCT,
  };
  const variants: BacktestVariantReport[] = [];
  const alertsByVariant: Record<string, ScoredAlert[]> = {};
  for (const [name, label, includeNews] of [
    ['full', 'Full replay (market-state + macro + news)', true],
    ['market_state_only', 'Market-state only (news excluded; macro kept)', false],
  ] as const) {
    const replay = replayPulse(hoursMs, pool, { includeNews });
    const { cells, scored } = scoreAlerts(replay.alerts, priceByScope, baseRates, scoreConfig);
    variants.push({
      name,
      label,
      diagnostics: replay.diagnostics,
      cells,
      verdict: worstVerdict(cells.filter((c) => c.primary).map((c) => c.verdict)),
    });
    alertsByVariant[name] = scored;
  }

  const notes: string[] = [
    '4h candles for `range_break` come from Binance spot history (`data-api.binance.vision`); the live collector reads USDT-M futures. Small basis difference.',
    'News cluster ids are read as stored today; clustering of older items may postdate them. Grouping only, never direction or severity.',
    'Most past hours see only news-v1 classifications (content type null), which the Pulse excludes by design; the content-typed news-v2/v3 rows exist only from 2026-10-09.',
    'Market-state rows are re-computed with the CURRENT rule set, so rules added later (spec 027: long_flush, short_squeeze, price_velocity, range_break, rsi_1h_extreme) fire in hours before they were deployed. That is the intent: the gate scores the model as it would ship.',
    'Snapshots are upserted per (asset, hour); a re-run of the same hour overwrites the row, and the replay sees the final version. Stored signals from an earlier run of that hour can therefore differ slightly from the replay.',
  ];
  if (ruleFailures.size > 0) {
    notes.push(
      `Rules that threw during replay (skipped, as in production): ${[...ruleFailures].map(([r, n]) => `${r} ×${n}`).join(', ')}.`,
    );
  }

  const full = variants[0];
  const report: BacktestReport = {
    generatedAt: new Date(nowMs).toISOString(),
    config: {
      days: DAYS,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      horizonHours: PULSE_BACKTEST_HORIZON_HOURS,
      movePct: PULSE_BACKTEST_MOVE_PCT,
      minAlerts: PULSE_BACKTEST_MIN_ALERTS,
      pMax: PULSE_BACKTEST_P_MAX,
      marketAsset: PULSE_BACKTEST_MARKET_ASSET,
    },
    baseRates,
    variants,
    overallVerdict: full.verdict,
    notes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const mdFile = join(OUT_DIR, 'pulse-backtest-report.md');
  const jsonFile = join(OUT_DIR, 'pulse-backtest-results.json');
  writeFileSync(mdFile, renderBacktestReport(report));
  writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        ...report,
        alerts: Object.fromEntries(
          Object.entries(alertsByVariant).map(([name, list]) => [
            name,
            list.map((a) => ({ ...a, at: new Date(a.atMs).toISOString() })),
          ]),
        ),
      },
      null,
      2,
    ),
  );

  for (const v of variants) {
    const d = v.diagnostics;
    const m = d.meanRowsPerHour;
    console.log(`\n--- ${v.label}: VERDICT ${v.verdict} ---`);
    console.log(
      `  hours replayed ${d.hours}; rows/hour market-state ${m.marketState.toFixed(1)}, macro ${m.macro.toFixed(1)}, ` +
        `news ${m.news.toFixed(1)} (content-typed ${m.newsClassified.toFixed(1)})`,
    );
    console.log(
      `  points ok/insufficient: ${PULSE_SCOPES.map((s) => `${s} ${d.okPoints[s]}/${d.insufficientPoints[s]}`).join(', ')}`,
    );
    for (const c of v.cells.filter((cell) => cell.decided > 0 || cell.primary)) {
      console.log(
        `  ${c.scope}/${c.type}: decided ${c.decided}, spaced-out ${c.spacedOut}, censored ${c.censored}, ` +
          `n ${c.n}, hits ${c.hits}, base ${c.baseRate === null ? '–' : (c.baseRate * 100).toFixed(1) + '%'}, ` +
          `p ${c.pValue === null ? '–' : c.pValue.toFixed(3)} → ${c.verdict}`,
      );
    }
  }

  console.log(
    `\n=== OVERALL VERDICT (full replay, worst confluence cell): ${report.overallVerdict} ===`,
  );
  console.log('PASTE INTO src/consts/pulse.ts:');
  console.log(`  PULSE_BACKTEST_N = ${JSON.stringify(backtestN(full.cells))}`);
  console.log(`\nReport:  ${mdFile}\nResults: ${jsonFile}\n`);
}

main()
  .catch((err: unknown) => {
    console.error('\nError:', err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
