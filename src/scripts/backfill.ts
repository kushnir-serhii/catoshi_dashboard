/**
 * Market history backfill driver (spec 013, Slice 4).
 *
 * A command-line-only maintenance script — never a Route Handler, never
 * reachable over HTTP (functional-spec AC 2.5). It walks backwards-collected
 * candle history one daily timestamp at a time and writes inferred `snapshots`
 * rows so spec 012's analog search has several years of price-shaped history
 * to search instead of a few weeks.
 *
 * What it does NOT do: reconstruct funding / open interest / long-short ratio /
 * liquidations / ETF flow for past dates — that data does not exist. Those
 * fields are written `NULL`, never `0` (AC 2.4), and every row is stamped
 * `raw.backfill = true` plus the list of fields that were absent at write time
 * (AC 2.2), so measured and inferred history are never silently mixed.
 *
 * Usage (run from the repo root):
 *   node --env-file=.env.local --import tsx src/scripts/backfill.ts --asset ETH
 *   node --env-file=.env.local --import tsx src/scripts/backfill.ts \
 *     --asset BTC --from 2020-01-01 --to 2020-06-30 --dry-run
 *   npm run backfill -- --asset SOL --to 2026-08-31
 *
 * Arguments:
 *   --asset  <BTC|ETH|SOL>   required. One asset per invocation (memory — the
 *                            full 15m history is held in RAM; three assets at
 *                            once is ~900k candles, technical-considerations §2.4).
 *   --from   <YYYY-MM-DD>    optional. Defaults to the asset's BACKFILL_START.
 *                            Clamped forward to BACKFILL_START if earlier.
 *   --to     <YYYY-MM-DD>    optional. Defaults to yesterday (UTC). Bound this
 *                            to end before live collection began so the daily
 *                            00:00:00Z collision with the hourly collector
 *                            stays rare (the conflict predicate makes it
 *                            harmless either way).
 *   --dry-run               assemble and report, write nothing.
 *
 * Point-in-time rule (technical-considerations §3.2): the row for date D is
 * assembled from candles whose `closeTime` is at or before the end of day D
 * (`sliceAt = D 23:59:59.999Z`), so no candle from D+1 or later contributes.
 * The row carries ts = `D 00:00:00Z` (AC 2.1) and its `rsi_1d` therefore
 * equals RSI(14) at day D's close on a daily chart — that is the Slice 4
 * verification check.
 */
import { BACKFILL_START, COLLECT_ASSETS, COLLECT_TIMEFRAMES } from '@/consts/collect';
import type { MarketSnapshot } from '@/data/types';
import { fetchKlinesRange, type KlinesByTimeframe } from '@/lib/collectors/binanceKlines';
import { fetchFearGreedHistory } from '@/lib/collectors/fearGreed';
import { upsertSnapshots } from '@/lib/db/analytics';
import { query } from '@/lib/db/client';
import { assembleSnapshot, type FearGreedReading } from '@/lib/snapshotBuilder';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Neighbour-exclusion windows for the effective-sample-size report (spec 013
 * functional-spec In-Scope, amendment 02.09.2026 — "report the effective sample
 * size after neighbour exclusion alongside the raw per-asset row counts").
 *
 * Spec 012's guard is pinned down: `find_analogs` excludes any analog within
 * `30 + horizon_days` days of the query (spec 012 functional-spec §"Neighbour
 * exclusion", technical-considerations §2.3 — "exclusion window `30 + horizon_days`
 * … never a literal 30"). The horizons 1 / 7 / 30 days are spec 012's reported
 * horizons. The amendment's "roughly 14 days" is superseded by this exact rule;
 * see the report footer.
 *
 * These live here rather than in `src/consts/` because spec 012 is unbuilt and
 * `src/consts/analogs.ts` does not exist yet — this is the only file that reads
 * them today (constants rule: shared = 2+ files).
 */
const NEIGHBOUR_EXCLUSION_HORIZON_DAYS: readonly number[] = [1, 7, 30];
const NEIGHBOUR_EXCLUSION_BASE_DAYS = 30;

/**
 * Greedy nearest-independent sample count for the effective-sample-size report.
 *
 * Walks the written daily timestamps in order and keeps one only when it is at
 * least `windowDays` after the last kept timestamp — spec 012's neighbour-
 * exclusion guard (012 functional-spec §2.3: "snapshots within `30 + horizon`
 * days of the query are excluded") applied to the back-filled series. The result
 * is how many *near-independent* historical setups the backfill actually adds
 * per horizon, which is the quantity spec 012's power curve is denominated in —
 * not the raw row count (013 functional-spec In-Scope, amendment 02.09.2026).
 *
 * The amendment's tentative "roughly 14 days" is superseded here by 012's pinned
 * `30 + horizon_days` rule (012 technical-considerations §2.3: "never a literal
 * 30"), so no assumption is stated in the output — the window is quoted instead.
 */
function effectiveSampleSize(timestampsMs: readonly number[], windowDays: number): number {
  if (timestampsMs.length === 0) {
    return 0;
  }
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const windowMs = windowDays * DAY_MS;
  let kept = 1;
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - last >= windowMs) {
      kept += 1;
      last = sorted[i];
    }
  }
  return kept;
}

/**
 * The derivative / positioning / flow columns that are absent from every
 * back-filled row by definition (technical-considerations §3.3). Spelled
 * exactly as that section documents them, so the marker's `absent_fields`
 * list matches the spec text downstream readers were pointed at.
 */
const ABSENT_DERIVATIVE_FIELDS: readonly string[] = [
  'funding_rate',
  'open_interest_usd',
  'long_short_ratio',
  'liq_24h_usd',
  'etf_flow_usd',
];

/**
 * Indicator columns whose value can legitimately come out `NULL` for a
 * back-filled row — a timeframe with too few candles for the indicator's
 * window near the start of history (AC 2.4). Paired column name (as stored)
 * ↔ `MarketSnapshot` accessor.
 */
const INDICATOR_COLUMNS: ReadonlyArray<readonly [string, keyof MarketSnapshot]> = [
  ['rsi_15m', 'rsi15m'],
  ['rsi_1h', 'rsi1h'],
  ['rsi_4h', 'rsi4h'],
  ['rsi_1d', 'rsi1d'],
  ['ma7_15m', 'ma715m'],
  ['ma25_15m', 'ma2515m'],
  ['ma99_15m', 'ma9915m'],
  ['atr_15m', 'atr15m'],
  ['volume_z_15m', 'volumeZ15m'],
  ['structure_15m', 'structure15m'],
  ['ma7_1h', 'ma71h'],
  ['ma25_1h', 'ma251h'],
  ['ma99_1h', 'ma991h'],
  ['atr_1h', 'atr1h'],
  ['volume_z_1h', 'volumeZ1h'],
  ['structure_1h', 'structure1h'],
  ['ma7_4h', 'ma74h'],
  ['ma25_4h', 'ma254h'],
  ['ma99_4h', 'ma994h'],
  ['atr_4h', 'atr4h'],
  ['volume_z_4h', 'volumeZ4h'],
  ['structure_4h', 'structure4h'],
  ['ma7_1d', 'ma7Daily'],
  ['ma25_1d', 'ma25Daily'],
  ['ma99_1d', 'ma99Daily'],
  ['pct_from_ma7_1d', 'pctFromMa7Daily'],
  ['pct_from_ma25_1d', 'pctFromMa25Daily'],
  ['pct_from_ma99_1d', 'pctFromMa99Daily'],
  ['atr_1d', 'atrDaily'],
  ['volume_z_1d', 'volumeZDaily'],
  ['structure_1d', 'structureDaily'],
];

interface Args {
  asset: string;
  from: string | null;
  to: string | null;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { asset: '', from: null, to: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--asset':
        args.asset = argv[++i] ?? '';
        break;
      case '--from':
        args.from = argv[++i] ?? null;
        break;
      case '--to':
        args.to = argv[++i] ?? null;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`unknown argument "${token}"`);
    }
  }
  return args;
}

/** `YYYY-MM-DD` → ms epoch at `00:00:00Z`. Throws on a malformed date. */
function dayStartMs(date: string): number {
  if (!DATE_RE.test(date)) {
    throw new Error(`date must be YYYY-MM-DD, got "${date}"`);
  }
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    throw new Error(`invalid date "${date}"`);
  }
  return ms;
}

/** ms epoch → `YYYY-MM-DD` (UTC). */
function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function resolveAssetId(symbol: string): Promise<number> {
  const rows = await query<{ id: number }>('select id from assets where symbol = $1', [symbol]);
  if (rows.length === 0) {
    throw new Error(`no assets row for symbol "${symbol}"`);
  }
  return rows[0].id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const asset = COLLECT_ASSETS.find((a) => a.symbol === args.asset);
  if (!asset) {
    throw new Error(
      `--asset must be one of ${COLLECT_ASSETS.map((a) => a.symbol).join(', ')} (got "${args.asset}")`,
    );
  }

  const backfillStartMs = dayStartMs(BACKFILL_START[asset.symbol]);

  let fromMs = args.from ? dayStartMs(args.from) : backfillStartMs;
  if (fromMs < backfillStartMs) {
    console.warn(
      `--from ${args.from} is before ${asset.symbol}'s contract start ${BACKFILL_START[asset.symbol]}; clamping.`,
    );
    fromMs = backfillStartMs;
  }

  // Default --to: yesterday. The backfill describes closed days only, and
  // bounding it before live collection began keeps the 00:00:00Z collision rare.
  const yesterdayMs = dayStartMs(dateKey(Date.now())) - DAY_MS;
  const toMs = args.to ? dayStartMs(args.to) : yesterdayMs;

  if (toMs < fromMs) {
    throw new Error(`--to (${dateKey(toMs)}) is before --from (${dateKey(fromMs)})`);
  }

  if (!args.dryRun && !process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Run with node --env-file=.env.local, or pass --dry-run.',
    );
  }

  const runIso = new Date().toISOString();
  console.log(
    `backfill: ${asset.symbol} ${dateKey(fromMs)} → ${dateKey(toMs)}` +
      `${args.dryRun ? ' (dry run)' : ''}`,
  );

  // 1. Download the full 4-timeframe candle history once, into memory. Always
  //    from the contract start (not --from) so the earliest days in range have
  //    full indicator lookback. Sequential per timeframe; never parallelised.
  const fetchEndMs = toMs + DAY_MS - 1;
  const history: KlinesByTimeframe = {};
  for (const tf of COLLECT_TIMEFRAMES) {
    const started = Date.now();
    const candles = await fetchKlinesRange(asset.binancePair, tf, backfillStartMs, fetchEndMs);
    if (candles === null) {
      throw new Error(`fetchKlinesRange failed for ${asset.binancePair} ${tf} — re-run the range`);
    }
    history[tf] = candles;
    console.log(
      `  ${tf}: ${candles.length} candles (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  }

  // 2. Full published Fear & Greed history, date-indexed. A missing date → the
  //    reading is left null for that row (never interpolated, AC 2.3).
  const fearGreedByDate = await fetchFearGreedHistory();
  if (fearGreedByDate === null) {
    console.warn('  fear & greed history unavailable — fear_greed will be null for every row');
  }

  const assetId =
    args.dryRun && !process.env.DATABASE_URL ? -1 : await resolveAssetId(asset.symbol);

  // 3. Walk each daily timestamp in range.
  const snapshots: MarketSnapshot[] = [];
  const absentFieldCounts = new Map<string, number>();
  let scanned = 0;
  let skipped = 0;

  for (let d = fromMs; d <= toMs; d += DAY_MS) {
    scanned += 1;
    const ts = new Date(d);
    const sliceAt = new Date(d + DAY_MS - 1);

    const fgValue = fearGreedByDate?.get(dateKey(d)) ?? null;
    const fg7dAgo = fearGreedByDate?.get(dateKey(d - 7 * DAY_MS)) ?? null;
    const fearGreed: FearGreedReading | null =
      fgValue === null ? null : { value: fgValue, value7dAgo: fg7dAgo };

    let snapshot: MarketSnapshot;
    try {
      ({ snapshot } = assembleSnapshot({
        assetId,
        ts,
        klinesByTf: history,
        fearGreed,
        // derivatives omitted → all-null (the backfill case).
        sliceAt,
      }));
    } catch {
      // No usable daily close for this timestamp (before the contract's first
      // candle, or a genuine feed gap) → skip, never write invented values (AC 2.1).
      skipped += 1;
      continue;
    }

    // Absent-field list for the marker: the five derivative/flow columns, plus
    // market cap (no historical source), plus any indicator that came out null
    // from a short window.
    const absentFields: string[] = [...ABSENT_DERIVATIVE_FIELDS];
    if (snapshot.marketCapUsd === null) absentFields.push('market_cap_usd');
    for (const [column, key] of INDICATOR_COLUMNS) {
      if (snapshot[key] === null) absentFields.push(column);
    }
    for (const field of absentFields) {
      absentFieldCounts.set(field, (absentFieldCounts.get(field) ?? 0) + 1);
    }

    // Derivative / positioning / flow fields: NULL, never 0 (AC 2.4). These are
    // already null via the omitted `derivatives` arg; set them explicitly so a
    // future change to `assembleSnapshot`'s defaults cannot leak a 0 in here.
    snapshot.fundingRate = null;
    snapshot.fundingRateDelta24h = null;
    snapshot.openInterestUsd = null;
    snapshot.openInterestChange24hPct = null;
    snapshot.longShortRatio = null;
    snapshot.liquidations24hUsd = null;
    snapshot.liquidationsDominantSide = null;
    snapshot.etfNetFlowUsd = null;
    snapshot.etfStreakDays = null;
    snapshot.etfFlow7dUsd = null;
    snapshot.marketCapUsd = null;

    // Replace `raw` entirely — `assembleSnapshot` stuffs the whole multi-year
    // `klinesByTf` into it, which must not be persisted per row. Keep only the
    // marker and the F&G reading actually used (AC 2.2).
    snapshot.raw = {
      backfill: true,
      backfill_run: runIso,
      absent_fields: absentFields,
      fear_greed: fgValue,
      fear_greed_7d_ago: fg7dAgo,
    };

    snapshots.push(snapshot);
  }

  // 4. Write, chunked. `upsertSnapshots` will not overwrite a live row.
  let written = 0;
  if (!args.dryRun) {
    const result = await upsertSnapshots(snapshots);
    if (result.error) {
      throw result.error;
    }
    written = result.written;
  }

  // 5. Per-asset coverage report (spec 013, Slice 5).
  const total = snapshots.length;
  const firstDate = total > 0 ? snapshots[0].ts.slice(0, 10) : '—';
  const lastDate = total > 0 ? snapshots[total - 1].ts.slice(0, 10) : '—';

  // Fields absent from *every* written row (structurally unavailable in backfill)
  // vs fields absent only from some (an indicator nulled by a short window near
  // the start of history) — functional-spec AC 2.4.
  const nulledThroughout = [...absentFieldCounts.entries()]
    .filter(([, count]) => count === total && total > 0)
    .map(([field]) => field)
    .sort();
  const nulledSometimes = [...absentFieldCounts.entries()]
    .filter(([, count]) => count > 0 && count < total)
    .map(([field, count]) => `${field} (${count}/${total})`)
    .sort();

  const writtenTimestampsMs = snapshots.map((snapshot) => Date.parse(snapshot.ts));

  console.log('');
  console.log(`=== coverage report — ${asset.symbol} ===`);
  console.log(`  first back-filled date    ${firstDate}`);
  console.log(`  last back-filled date     ${lastDate}`);
  console.log(`  days scanned              ${scanned}`);
  console.log(`  rows assembled            ${total}`);
  console.log(`  days skipped (no candle)  ${skipped}`);
  console.log(
    args.dryRun
      ? '  rows written              0 (dry run)'
      : `  rows written              ${written} (inserted or updated; live rows left intact)`,
  );
  console.log(`  null in every row         ${nulledThroughout.join(', ') || '—'}`);
  console.log(`  null in some rows         ${nulledSometimes.join(', ') || '—'}`);

  // Effective sample size after neighbour exclusion (amendment, 02.09.2026).
  // Every argument in this spec turns on this number, not on `total`.
  console.log('');
  console.log('  effective sample size after neighbour exclusion');
  console.log('  spec 012 guard: exclude analogs within (30 + horizon_days) of one another;');
  console.log('  greedy nearest-independent selection over the written daily timestamps');
  for (const horizon of NEIGHBOUR_EXCLUSION_HORIZON_DAYS) {
    const windowDays = NEIGHBOUR_EXCLUSION_BASE_DAYS + horizon;
    const effective = effectiveSampleSize(writtenTimestampsMs, windowDays);
    console.log(
      `    horizon ${String(horizon).padStart(2)}d  ` +
        `→ exclusion window ${String(windowDays).padStart(2)}d  ` +
        `→ ${effective} near-independent samples (of ${total} raw rows)`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('backfill: fatal error —', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    // The `pg` Pool keeps the process alive otherwise (src/lib/db/client.ts).
    process.exit(process.exitCode ?? 0);
  });
