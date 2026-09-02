/**
 * ТЕСТ-ФАЛЬСИФІКАЦІЯ ГІПОТЕЗИ ІСТОРИЧНИХ АНАЛОГІВ (перед спекою 012)
 * ==================================================================
 *
 * Питання: чи несе вектор стану ринку інформацію про форвардну дохідність?
 * Якщо ні — `find_analogs` поверне сусідів, які нічого не означають, і
 * будувати HNSW-індекс немає сенсу.
 *
 * Запуск ІЗ КОРЕНЯ РЕПОЗИТОРІЮ:
 *   npx tsx src/scripts/analog-falsification.ts
 *   npx tsx src/scripts/analog-falsification.ts --assets BTC,ETH --perms 2000
 *
 * Бази даних НЕ торкається. Свічки тягне з публічного Binance REST і кешує
 * в `.cache/analogs/`, тож перший запуск ~5-10 хв, наступні — швидко.
 * Ключі API не потрібні.
 *
 * ЩО САМЕ ТЕСТУЄТЬСЯ
 * ------------------
 * Денні знімки з тим самим 16-вимірним вектором, що й `build_state_vec()`
 * у `catoshi-schema.sql`, порахованим ТИМИ Ж функціями з `@/lib/indicators`,
 * що їх використовує `snapshotBuilder`. Шість деривативних вимірів
 * (funding, OI, long/short, ліквідації, ETF) не бекфіляться — вони лишаються
 * на COALESCE-дефолтах, тобто константні, тобто не впливають на L2-відстань.
 * Фактично це тест 10 цінових вимірів — і це не вада тесту, а точне
 * відтворення того, що матиме `find_analogs` на історичних рядках.
 *
 * ТРИ СТАТИСТИКИ (кожна проти перестановочного нуля)
 * --------------------------------------------------
 *   1. dispersionRatio — std дохідності серед k сусідів / std по вибірці.
 *      Нижче за нуль = аналоги звужують діапазон. Саме тут kNN у літературі
 *      й працює: волатильність передбачувана, напрямок — ні.
 *   2. dirAccuracy — знак медіани сусідів проти факту, проти базової ставки.
 *   3. logScoreGain — розподіл сусідів по терцилях проти кліматології.
 *      УВАГА: від'ємний навіть за наявності сигналу (оцінка по k сусідах
 *      шумна, і шум коштує лог-скору). Читати ЛИШЕ відносно nullMean.
 *
 * ЧОМУ ПЕРЕСТАНОВОЧНИЙ ТЕСТ, А НЕ t-ТЕСТ
 * --------------------------------------
 * Перекривні дохідності сильно автокорельовані й важкохвості; t-тест тут
 * набреше. Нуль — циклічний зсув ряду дохідностей відносно ряду станів:
 * зберігає автокореляцію дохідностей і геометрію простору станів, ламає
 * лише відповідність між ними. Множини сусідів від зсуву не залежать,
 * тому 1000 перестановок коштують копійки.
 *
 * ЗАХИСТ ВІД САМООБМАНУ
 * ---------------------
 *   - Вікно виключення 30 + horizon днів. Просто 30 замало: при h=30 сусід
 *     за 31 день має форвардне вікно, що перетинається із запитом.
 *   - Причинний режим: сусіди лише з МИНУЛОГО. Двобічний рахується як
 *     верхня межа — якщо порожній навіть він, питання закрите.
 *   - Кандидати в сусіди — лише рядки з відомою форвардною дохідністю.
 *   - `lastClosedIndex`: індикатори не бачать свічку, що ще торгується.
 *   - Поправка Бонферроні на всю родину тестів.
 *   - Аналіз потужності: без нього «нічого не знайшли» не відрізнити від
 *     «не змогли б знайти».
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rsi, sma, atr, zScore, pctFrom, structure } from '@/lib/indicators';
import {
  BASE_EXCLUSION_DAYS,
  DAY_MS,
  K,
  runTest,
  zScoreColumns,
  powerAnalysis,
  type TestResult,
} from './analog-core';

// ---------------------------------------------------------------------------
// Конфіг
// ---------------------------------------------------------------------------

const TF = ['15m', '1h', '4h', '1d'] as const;
type Timeframe = (typeof TF)[number];

const SYMBOLS: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' };

/** Індекс страху й жадібності починається 2018-02-01. */
const START = Date.UTC(2018, 1, 1);
const HORIZONS = [1, 7, 30];

/**
 * Скільки барів подавати індикаторам. Згладжування Вайлдера (RSI, ATR)
 * залежить від усієї історії, але збігається геометрично: на 300 барах
 * розбіжність із розрахунком по повній історії — 2e-8, тобто нуль.
 * Перевірено окремо; менше 200 брати не можна.
 */
const WINDOW = 300;

const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const MA_PERIODS = [7, 25, 99] as const;
const VOLUME_Z_LOOKBACK = 20;
const STRUCTURE_LOOKBACK = 20;

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.cache', 'analogs');
const OUT_DIR = join(ROOT, '.cache', 'analogs', 'out');

const args = process.argv.slice(2);
const argVal = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ASSETS = argVal('assets', 'BTC,ETH,SOL').split(',');
const PERMS = parseInt(argVal('perms', '1000'), 10);

// ---------------------------------------------------------------------------
// Завантаження даних
// ---------------------------------------------------------------------------

interface Candle {
  openTime: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

const HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getKlinePage(path: string): Promise<unknown[]> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(host + path);
        if (res.status === 429 || res.status === 418) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as unknown[];
      } catch (err) {
        lastErr = err;
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw new Error(`Не вдалось отримати ${path}: ${String(lastErr)}`);
}

async function fetchKlines(symbol: string, interval: Timeframe): Promise<Candle[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${symbol}-${interval}.json`);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as Candle[];
    process.stdout.write(`  ${symbol} ${interval}: ${cached.length} свічок (кеш)\n`);
    return cached;
  }

  const out: Candle[] = [];
  // Запас на прогрів: MA99 на денному ТФ + вікно згладжування.
  let cursor = START - 400 * DAY_MS;
  process.stdout.write(`  ${symbol} ${interval}: тягну`);

  for (;;) {
    const rows = (await getKlinePage(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&limit=1000`,
    )) as (string | number)[][];
    if (!rows.length) break;

    for (const r of rows) {
      out.push({
        openTime: Number(r[0]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
        closeTime: Number(r[6]),
      });
    }
    process.stdout.write('.');
    if (rows.length < 1000) break;
    cursor = Number(rows[rows.length - 1][6]) + 1;
    await sleep(120);
  }

  writeFileSync(cacheFile, JSON.stringify(out));
  process.stdout.write(` ${out.length}\n`);
  return out;
}

async function fetchFearGreedHistory(): Promise<Map<number, number>> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, 'fear-greed.json');
  let raw: { data: { timestamp: string; value: string }[] };
  if (existsSync(cacheFile)) {
    raw = JSON.parse(readFileSync(cacheFile, 'utf8'));
  } else {
    const res = await fetch('https://api.alternative.me/fng/?limit=0&format=json');
    if (!res.ok) throw new Error(`Fear & Greed: ${res.status}`);
    raw = (await res.json()) as typeof raw;
    writeFileSync(cacheFile, JSON.stringify(raw));
  }
  const map = new Map<number, number>();
  for (const row of raw.data) {
    const ts = parseInt(row.timestamp, 10) * 1000;
    map.set(Math.floor(ts / DAY_MS) * DAY_MS, parseInt(row.value, 10));
  }
  process.stdout.write(`  Fear & Greed: ${map.size} днів\n`);
  return map;
}

// ---------------------------------------------------------------------------
// Побудова знімків
// ---------------------------------------------------------------------------

/**
 * Індекс останньої свічки, ЗАКРИТОЇ строго до `ts`. Єдине місце, де
 * вирішується питання зазирання вперед: свічка, що ще торгується в момент
 * знімка, індикаторам не видна.
 */
function lastClosedIndex(candles: Candle[], ts: number): number {
  let lo = 0;
  let hi = candles.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].closeTime < ts) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}

interface TfValues {
  rsi: number | null;
  distMa7: number | null;
  distMa25: number | null;
  distMa99: number | null;
  atrPct: number | null;
  volumeZ: number | null;
  structure: 'HH-HL' | 'LH-LL' | 'RANGE';
}

/** Індикатори одного ТФ станом на момент `ts`, через функції `@/lib/indicators`. */
function timeframeAt(candles: Candle[], ts: number): TfValues | null {
  const end = lastClosedIndex(candles, ts);
  if (end < MA_PERIODS[2]) return null;

  const from = Math.max(0, end + 1 - WINDOW);
  const win = candles.slice(from, end + 1);
  const closes = win.map((c) => c.close);
  const highs = win.map((c) => c.high);
  const lows = win.map((c) => c.low);
  const volumes = win.map((c) => c.volume);
  const price = closes[closes.length - 1];

  const ma7 = sma(closes, MA_PERIODS[0]);
  const ma25 = sma(closes, MA_PERIODS[1]);
  const ma99 = sma(closes, MA_PERIODS[2]);
  const atrValue = atr(highs, lows, closes, ATR_PERIOD);

  return {
    rsi: rsi(closes, RSI_PERIOD),
    distMa7: ma7 === null ? null : pctFrom(price, ma7),
    distMa25: ma25 === null ? null : pctFrom(price, ma25),
    distMa99: ma99 === null ? null : pctFrom(price, ma99),
    atrPct: atrValue === null ? null : pctFrom(price + atrValue, price),
    volumeZ: zScore(volumes, VOLUME_Z_LOOKBACK),
    structure: structure(highs, lows, STRUCTURE_LOOKBACK),
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const nz = (x: number | null, fallback: number) => (x === null || !Number.isFinite(x) ? fallback : x);

/**
 * Точне відтворення `build_state_vec()` з `catoshi-schema.sql`.
 * Виміри 10-14 і 16 лишаються на COALESCE-дефолтах: історії для них немає,
 * тому вони константні й не впливають на L2-відстань.
 */
function buildStateVec(tf: Record<Timeframe, TfValues>, fearGreed: number): number[] {
  const d = tf['1d'];
  return [
    nz(tf['15m'].rsi, 50) / 100,
    nz(tf['1h'].rsi, 50) / 100,
    nz(tf['4h'].rsi, 50) / 100,
    nz(d.rsi, 50) / 100,
    clamp(nz(d.distMa7, 0) / 20, -1, 1),
    clamp(nz(d.distMa25, 0) / 50, -1, 1),
    clamp(nz(d.distMa99, 0) / 100, -1, 1),
    clamp(nz(d.atrPct, 0) / 10, 0, 1),
    clamp(nz(d.volumeZ, 0) / 3, -1, 1),
    0, // funding_rate
    0, // funding_chg_24h
    0, // oi_chg_24h_pct
    0, // long_short_ratio: ln(1) / 1.5
    0.5, // liq_24h_short_share
    fearGreed / 100,
    0, // etf_streak_days
  ];
}

/** Виміри, які реально змінюються — решта константні й не впливають на L2. */
const ACTIVE_DIMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 14];
const DIM_NAMES = [
  'rsi_15m', 'rsi_1h', 'rsi_4h', 'rsi_1d',
  'dist_ma7_1d', 'dist_ma25_1d', 'dist_ma99_1d',
  'atr_pct_1d', 'volume_z_1d', 'funding', 'funding_chg',
  'oi_chg', 'long_short', 'liq_short_share', 'fear_greed', 'etf_streak',
];

interface Snapshot {
  ts: number;
  price: number;
  vec: number[];
}

async function buildSnapshots(asset: string, fng: Map<number, number>): Promise<Snapshot[]> {
  const symbol = SYMBOLS[asset];
  const candles = {} as Record<Timeframe, Candle[]>;
  for (const tf of TF) candles[tf] = await fetchKlines(symbol, tf);

  const daily = candles['1d'];
  const out: Snapshot[] = [];

  for (const bar of daily) {
    const ts = bar.closeTime + 1; // знімок одразу після закриття денної свічки
    if (ts < START) continue;

    const perTf = {} as Record<Timeframe, TfValues>;
    let complete = true;
    for (const tf of TF) {
      const values = timeframeAt(candles[tf], ts);
      if (values === null || values.rsi === null || values.distMa99 === null) {
        complete = false;
        break;
      }
      perTf[tf] = values;
    }
    if (!complete) continue;

    const day = Math.floor(ts / DAY_MS) * DAY_MS;
    const fg = fng.get(day) ?? fng.get(day - DAY_MS);
    if (fg === undefined) continue;

    out.push({ ts, price: bar.close, vec: buildStateVec(perTf, fg) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Головна
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== ТЕСТ-ФАЛЬСИФІКАЦІЯ ГІПОТЕЗИ АНАЛОГІВ ===\n');
  console.log(`Активи: ${ASSETS.join(', ')} · горизонти: ${HORIZONS.join('/')} д · k=${K}`);
  console.log(`Перестановок: ${PERMS} · виключення: ${BASE_EXCLUSION_DAYS}+h днів\n`);

  const fng = await fetchFearGreedHistory();
  const results: TestResult[] = [];
  const looResults: Record<string, Record<string, number>> = {};
  const powerCurves: Record<string, { strength: number; detectionRate: number }[]> = {};

  for (const asset of ASSETS) {
    if (!SYMBOLS[asset]) {
      console.log(`Пропускаю невідомий актив ${asset}`);
      continue;
    }
    console.log(`\n--- ${asset} ---`);

    const snaps = await buildSnapshots(asset, fng);
    if (snaps.length < 500) {
      console.log(`  замало знімків (${snaps.length}), пропускаю`);
      continue;
    }
    console.log(
      `  знімків: ${snaps.length} (${new Date(snaps[0].ts).toISOString().slice(0, 10)}` +
        ` → ${new Date(snaps[snaps.length - 1].ts).toISOString().slice(0, 10)})`,
    );
    console.log('  формат нижче: спостережене/нуль (p) — читати треба РІЗНИЦЮ, не абсолют');

    for (const horizon of HORIZONS) {
      // Компактні масиви лише з рядків, де форвардна дохідність відома
      // і денний крок не розірваний. Кандидати в сусіди — ці ж рядки.
      const rows: { ts: number; vec: number[]; ret: number }[] = [];
      for (let i = 0; i + horizon < snaps.length; i++) {
        const gap = Math.round((snaps[i + horizon].ts - snaps[i].ts) / DAY_MS);
        if (gap !== horizon) continue;
        rows.push({
          ts: snaps[i].ts,
          vec: snaps[i].vec,
          ret: snaps[i + horizon].price / snaps[i].price - 1,
        });
      }

      const vecSpec = rows.map((r) => r.vec);
      const vecZ = zScoreColumns(vecSpec, ACTIVE_DIMS);
      const timestamps = Float64Array.from(rows.map((r) => r.ts));
      const returns = Float64Array.from(rows.map((r) => r.ret));

      for (const [name, vecs] of [
        ['spec', vecSpec],
        ['z-score', vecZ],
      ] as const) {
        for (const causal of [true, false]) {
          const res = runTest(asset, horizon, name, causal, vecs, timestamps, returns, ACTIVE_DIMS, PERMS);
          results.push(res);
          const p = res.pValues!;
          const nm = res.nullMean!;
          console.log(
            `  h=${String(horizon).padStart(2)}д ${name.padEnd(7)} ${causal ? 'causal   ' : 'двобічний'} ` +
              `n=${String(res.n).padStart(4)} · ` +
              `disp=${res.observed.dispersionRatio.toFixed(3)}/${nm.dispersionRatio.toFixed(3)} (p=${p.dispersionRatio.toFixed(3)}) · ` +
              `dir=${(res.observed.dirAccuracy * 100).toFixed(1)}%/${(res.baselineDirAccuracy * 100).toFixed(1)}% (p=${p.dirAccuracy.toFixed(3)}) · ` +
              `log=${res.observed.logScoreGain.toFixed(4)}/${nm.logScoreGain.toFixed(4)} (p=${p.logScoreGain.toFixed(3)})`,
          );
        }
      }

      if (horizon === 7) {
        // Потужність на РЕАЛЬНІЙ геометрії станів.
        const curve = powerAnalysis(
          vecSpec, timestamps, returns, ACTIVE_DIMS, horizon,
          [0, 0.1, 0.2, 0.4], 8, 200, 0.05,
        );
        powerCurves[asset] = curve;
        console.log('  потужність (підсаджений сигнал відомої сили):');
        for (const pt of curve) {
          console.log(`    сила ${pt.strength.toFixed(2)} -> виявлено ${(pt.detectionRate * 100).toFixed(0)}%`);
        }

        // Leave-one-out — без перестановок, цікавить лише зсув logScoreGain.
        looResults[asset] = {};
        const full = runTest(asset, horizon, 'spec', true, vecSpec, timestamps, returns, ACTIVE_DIMS, 0);
        looResults[asset]['(усі виміри)'] = full.observed.logScoreGain;
        for (const drop of ACTIVE_DIMS) {
          const dims = ACTIVE_DIMS.filter((d) => d !== drop);
          const r = runTest(asset, horizon, 'spec', true, vecSpec, timestamps, returns, dims, 0);
          looResults[asset][DIM_NAMES[drop]] = r.observed.logScoreGain;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Вердикт
  // -------------------------------------------------------------------------

  console.log('\n\n=== LEAVE-ONE-OUT (h=7д, spec, causal) ===');
  console.log('logScoreGain без цього виміру. Δ > 0 означає, що вимір ШКОДИТЬ.\n');
  for (const [asset, dims] of Object.entries(looResults)) {
    const base = dims['(усі виміри)'];
    console.log(`  ${asset} — усі виміри: ${base.toFixed(4)}`);
    for (const [name, gain] of Object.entries(dims)) {
      if (name === '(усі виміри)') continue;
      const delta = gain - base;
      console.log(
        `    без ${name.padEnd(14)} ${gain.toFixed(4)}  (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(4)})`,
      );
    }
  }

  const familySize = results.length * 3;
  const bonferroni = 0.05 / familySize;

  console.log('\n\n=== ВЕРДИКТ ===\n');
  console.log(`Родина тестів: ${familySize} · поріг Бонферроні: p < ${bonferroni.toFixed(5)}\n`);

  const survivors = results.filter((r) => {
    const p = r.pValues!;
    return (
      p.logScoreGain < bonferroni ||
      p.dispersionRatio < bonferroni ||
      (p.dirAccuracy < bonferroni && r.observed.dirAccuracy > r.baselineDirAccuracy)
    );
  });

  if (survivors.length === 0) {
    console.log('  ЖОДЕН тест не пережив поправку на множинність.');
    console.log('  Аналоги на цих даних не несуть інформації про форвардну дохідність.\n');

    const detectable = Object.entries(powerCurves)
      .map(([a, c]) => {
        const hit = c.find((pt) => pt.detectionRate >= 0.8);
        return `${a}: ${hit ? `сила >= ${hit.strength.toFixed(2)}` : 'не ловить навіть найсильніший'}`;
      })
      .join(' · ');
    console.log(`  Що тест узагалі здатний був побачити — ${detectable}`);

    const blind = Object.values(powerCurves).every((c) => !c.some((pt) => pt.detectionRate >= 0.8));
    console.log(
      blind
        ? '\n  УВАГА: тест сліпий навіть до підсадженого сигналу. Це НЕ доказ\n' +
            '  відсутності аналогів — це доказ, що 10 вимірів на цій довжині\n' +
            '  історії не мають роздільної здатності. Спека 012 у нинішньому\n' +
            '  вигляді не запрацює з тієї ж причини. Виходи: менше вимірів,\n' +
            '  або погодинні знімки замість денних (кратно більше n).'
        : '\n  Тест мав потужність побачити сигнал помірної сили і не побачив.\n' +
            '  → Спеку 012 будувати не варто. Ресурс краще в 011 (Brier-цикл).',
    );
  } else {
    console.log(`  Вижило: ${survivors.length} тестів із ${results.length}`);
    for (const s of survivors) {
      const p = s.pValues!;
      const which: string[] = [];
      if (p.logScoreGain < bonferroni) which.push(`log=${s.observed.logScoreGain.toFixed(4)}`);
      if (p.dispersionRatio < bonferroni) which.push(`disp=${s.observed.dispersionRatio.toFixed(3)}`);
      if (p.dirAccuracy < bonferroni && s.observed.dirAccuracy > s.baselineDirAccuracy) {
        which.push(`dir=${(s.observed.dirAccuracy * 100).toFixed(1)}%`);
      }
      console.log(
        `    ${s.asset} h=${s.horizon}д ${s.weighting} ${s.causal ? 'causal' : 'двобічний'}: ${which.join(', ')}`,
      );
    }

    const causalSurvivors = survivors.filter((s) => s.causal);
    console.log('');
    if (causalSurvivors.length === 0) {
      console.log('  УВАГА: вижили лише двобічні тести — вони підглядають у майбутнє.');
      console.log('  Це верхня межа, не прогноз. Практичної цінності немає.');
    } else {
      const dirSurvives = causalSurvivors.some(
        (s) => s.pValues!.dirAccuracy < bonferroni && s.observed.dirAccuracy > s.baselineDirAccuracy,
      );
      console.log(
        dirSurvives
          ? '  Сигнал є і в НАПРЯМКУ. Це сильніше за очікуване з літератури —\n  перевір ще раз на витікання, перш ніж вірити.'
          : '  Сигнал є, але лише в ШИРИНІ діапазону, не в напрямку — як і очікувалось.\n  012 має сенс як джерело очікуваного діапазону й базових ставок,\n  НЕ як предиктор напрямку.',
      );
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, 'analog-test-results.json');
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: { assets: ASSETS, horizons: HORIZONS, k: K, perms: PERMS, exclusionBase: BASE_EXCLUSION_DAYS },
        results,
        looResults,
        powerCurves,
      },
      null,
      2,
    ),
  );
  console.log(`\nПовні результати: ${outFile}\n`);
}

main().catch((err) => {
  console.error('\nПомилка:', err);
  process.exit(1);
});
