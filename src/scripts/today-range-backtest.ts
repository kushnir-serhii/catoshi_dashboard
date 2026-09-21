/**
 * Spec 024 Slice 1 — THE GATE: out-of-sample calibration of the Today range model.
 * ================================================================================
 *
 * I/O ONLY. Every calculation (origins, k fit, coverage, reliability, verdict,
 * markdown) lives in `src/lib/todayRangeEval.ts`; this file fetches candles, calls it
 * and writes files.
 *
 * Run FROM THE REPO ROOT:
 *   npm run today-range-backtest
 *   npm run today-range-backtest -- --assets BTC,ETH --days 365
 *   npm run today-range-backtest -- --synthetic        (offline smoke run, seeded data)
 *   npm run today-range-backtest -- --refresh          (ignore the candle cache)
 *
 * Touches no database and needs no API key. Binance is unreachable from agent
 * sandboxes, so the real run is the `today-range-backtest` GitHub Actions workflow
 * (decisions.md §10).
 *
 * Data: 1h USDT-M futures klines via `fetchKlinesRange` (assets strictly one after
 * another, never in parallel), the still-open last candle dropped, cached under
 * `.cache/today-range/`. Any failed fetch or a series with gaps aborts the run with
 * a non-zero exit: a verdict on partial data is worse than no verdict.
 *
 * Outputs (`.cache/today-range/out/`): `today-range-report.md`,
 * `today-range-results.json`. Stdout ends with the verdict and fitted `k` per asset
 * in a paste-ready form for functional-spec §0 and `TODAY_SIGMA_K`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLLECT_ASSETS } from '@/consts/collect';
import { TODAY_GATE_HORIZON_HOURS } from '@/consts/today';
import { fetchKlinesRange } from '@/lib/collectors/binanceKlines';
import {
  buildAssetReport,
  mulberry32,
  renderReport,
  verdict,
  type AssetReport,
  type Candle,
  type GateHorizon,
} from '@/lib/todayRangeEval';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const INTERVAL = '1h';
/** Fewer candles than this per asset cannot produce a meaningful split. */
const MIN_CANDLES = 24 * 60;
const SYNTHETIC_SEED = 424242;

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.cache', 'today-range');
const OUT_DIR = join(CACHE_DIR, 'out');

const args = process.argv.slice(2);
const argVal = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

const ASSETS = argVal('assets', 'BTC,ETH,SOL')
  .split(',')
  .map((a) => a.trim().toUpperCase())
  .filter(Boolean);
const DAYS = parseInt(argVal('days', '730'), 10);
const SYNTHETIC = hasFlag('synthetic');
const REFRESH = hasFlag('refresh');

const HORIZONS: GateHorizon[] = [TODAY_GATE_HORIZON_HOURS, 'utc-day'];

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

/** Seeded regime-switching random walk: deterministic offline data for the smoke run. */
function syntheticCandles(days: number, seed: number): Candle[] {
  const rand = mulberry32(seed);
  const gauss = (): number => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const n = days * 24;
  const end = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const start = end - n * HOUR_MS;
  const out: Candle[] = [];
  let price = 100;
  let vol = 0.006;
  for (let i = 0; i < n; i += 1) {
    if (i % 72 === 0) vol = 0.003 + rand() * 0.01; // vol regime changes every 3 days
    const open = price;
    const close = open * Math.exp(vol * gauss());
    const wick = Math.abs(vol * gauss()) * 0.5;
    out.push({
      openTime: start + i * HOUR_MS,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
    });
    price = close;
  }
  return out;
}

async function loadCandles(symbol: string, pair: string, days: number): Promise<Candle[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${symbol}-${INTERVAL}-${days}d.json`);
  if (!REFRESH && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as Candle[];
    console.log(`  ${symbol}: ${cached.length} candles (cache)`);
    return cached;
  }
  const endTime = Date.now();
  const startTime = endTime - days * DAY_MS;
  console.log(`  ${symbol} (${pair}): fetching ${days}d of ${INTERVAL} ...`);
  const raw = await fetchKlinesRange(pair, INTERVAL, startTime, endTime);
  if (raw === null) fail(`${symbol}: fetchKlinesRange returned null (fetch failed)`);
  // Drop the still-open last candle: a bar counts only once its closeTime has passed.
  const candles: Candle[] = raw
    .filter((c) => c.closeTime < endTime)
    .map((c) => ({ openTime: c.openTime, open: c.open, high: c.high, low: c.low, close: c.close }));
  writeFileSync(cacheFile, JSON.stringify(candles));
  console.log(`  ${symbol}: ${candles.length} candles`);
  return candles;
}

function validate(symbol: string, candles: Candle[], days: number): void {
  const minRequired = Math.min(MIN_CANDLES, days * 24);
  if (candles.length < minRequired) {
    fail(`${symbol}: only ${candles.length} candles, need at least ${minRequired}`);
  }
  let gaps = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].openTime - candles[i - 1].openTime !== HOUR_MS) gaps += 1;
  }
  const expected = days * 24;
  // Binance has rare maintenance holes; the eval skips origins that span them.
  if (candles.length < expected * 0.95) {
    fail(`${symbol}: ${candles.length} candles is under 95% of the ${expected} expected`);
  }
  console.log(`  ${symbol}: ${gaps} gap(s) in the series (origins spanning a gap are skipped)`);
}

async function main(): Promise<void> {
  if (!Number.isFinite(DAYS) || DAYS < 60) fail(`--days must be a number >= 60 (got ${DAYS})`);
  console.log(
    `\n=== TODAY RANGE GATE${SYNTHETIC ? ' (SYNTHETIC SMOKE RUN, NOT A VERDICT)' : ''} ===`,
  );
  console.log(`assets=${ASSETS.join(',')} days=${DAYS} horizons=${HORIZONS.join(', ')}\n`);

  const reportsByHorizon = new Map<GateHorizon, AssetReport[]>();
  for (const h of HORIZONS) reportsByHorizon.set(h, []);

  // Assets strictly sequential (technical §4 / fetchKlinesRange contract).
  for (const symbol of ASSETS) {
    const meta = COLLECT_ASSETS.find((a) => a.symbol === symbol);
    if (!meta)
      fail(`unknown asset ${symbol}; known: ${COLLECT_ASSETS.map((a) => a.symbol).join(',')}`);
    const candles = SYNTHETIC
      ? syntheticCandles(DAYS, SYNTHETIC_SEED + symbol.charCodeAt(0))
      : await loadCandles(symbol, meta.binancePair, DAYS);
    validate(symbol, candles, DAYS);
    for (const h of HORIZONS) {
      const report = buildAssetReport(symbol, candles, h);
      if (report === null) fail(`${symbol} horizon ${h}: no usable train/test data`);
      reportsByHorizon.get(h)!.push(report);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const prefix = SYNTHETIC ? 'SYNTHETIC SMOKE RUN, NOT A VERDICT. ' : '';
  const markdown: string[] = [];
  const json: Record<string, unknown> = {
    generatedAt,
    synthetic: SYNTHETIC,
    config: { assets: ASSETS, days: DAYS, horizons: HORIZONS },
    horizons: {},
  };

  for (const h of HORIZONS) {
    const reports = reportsByHorizon.get(h)!;
    const result = verdict(reports);
    markdown.push(renderReport(reports, result, `${prefix}Today range gate, horizon ${h}`));
    (json.horizons as Record<string, unknown>)[String(h)] = { verdict: result, reports };

    console.log(`\n--- horizon ${h}: VERDICT ${result.verdict} ---`);
    for (const r of reports) {
      const a = result.perAsset.find((p) => p.asset === r.asset)!;
      console.log(
        `  ${r.asset}: k=${r.k.toFixed(3)} 90%=${(r.band90.coverage * 100).toFixed(1)}% ` +
          `50%=${(r.band50.coverage * 100).toFixed(1)}% bands=${a.bandsPass ? 'pass' : 'FAIL'} ` +
          `touch=${a.touchPass ? 'pass' : 'FAIL'} close-beyond=${a.closeBeyondPass ? 'pass' : 'FAIL'} ` +
          `(train ${r.nTrain}, test ${r.nTest})`,
      );
    }
  }

  const mdFile = join(OUT_DIR, 'today-range-report.md');
  const jsonFile = join(OUT_DIR, 'today-range-results.json');
  writeFileSync(mdFile, markdown.join('\n'));
  writeFileSync(jsonFile, JSON.stringify(json, null, 2));

  // Paste-ready block. k differs per horizon rule; the 24h fit is the canonical one
  // for TODAY_SIGMA_K unless the report says otherwise (rest-of-day is the UI horizon).
  console.log('\n=== PASTE INTO functional-spec §0 / TODAY_SIGMA_K ===');
  for (const h of HORIZONS) {
    const reports = reportsByHorizon.get(h)!;
    console.log(`horizon ${h}: verdict ${verdict(reports).verdict}`);
    console.log(
      `  TODAY_SIGMA_K (horizon ${h}) = { ${reports
        .map((r) => {
          const id = COLLECT_ASSETS.find((a) => a.symbol === r.asset)!.coingeckoId;
          return `${id}: ${r.k.toFixed(3)}`;
        })
        .join(', ')} }`,
    );
  }
  console.log(`\nReport:  ${mdFile}\nResults: ${jsonFile}\n`);
}

main().catch((err) => {
  console.error('\nError:', err);
  process.exit(1);
});
