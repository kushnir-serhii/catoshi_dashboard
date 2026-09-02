/**
 * Перевірка тесту аналогів на синтетиці з ВІДОМОЮ відповіддю.
 *
 * Сенс: перш ніж вірити вердикту на реальних даних, треба переконатись,
 * що машинерія (а) не знаходить сигнал там, де його нема, і (б) знаходить
 * там, де він є. Найважливіший випадок — третій: автокорельовані
 * перекривні дохідності БЕЗ звʼязку зі станом. Наївний тест дає на них
 * хибні спрацювання; циклічний зсув має лишитись відкаліброваним.
 *
 * Запуск:  npx tsx scripts/analog-core.test.ts
 */

import { runTest, zScoreColumns, powerAnalysis, DAY_MS } from './analog-core';
import { rsi, sma, atr, zScore, pctFrom, structure } from '@/lib/indicators';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- детермінований ГПВЧ, щоб прогони відтворювались --------------------
let seed = 12345;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

// ===========================================================================
console.log('\n1. ІНДИКАТОРИ (@/lib/indicators)\n');
// ===========================================================================

{
  const up = Array.from({ length: 50 }, (_, i) => 100 + i);
  const down = Array.from({ length: 50 }, (_, i) => 100 - i);
  check('RSI на монотонному зростанні = 100', Math.abs(rsi(up, 14)! - 100) < 1e-9);
  check('RSI на монотонному падінні = 0', Math.abs(rsi(down, 14)!) < 1e-9);
  check('RSI повертає null, коли даних замало', rsi(up.slice(0, 14), 14) === null);

  // Незалежна реалізація Вайлдера, написана інакше — звіряємо
  const series = Array.from({ length: 200 }, () => 100 + gauss() * 5);
  const ref = (() => {
    let g = 0, l = 0;
    for (let i = 1; i <= 14; i++) {
      const d = series[i] - series[i - 1];
      g += Math.max(d, 0); l += Math.max(-d, 0);
    }
    g /= 14; l /= 14;
    for (let i = 15; i < series.length; i++) {
      const d = series[i] - series[i - 1];
      g = (g * 13 + Math.max(d, 0)) / 14;
      l = (l * 13 + Math.max(-d, 0)) / 14;
    }
    return 100 - 100 / (1 + g / l);
  })();
  check('RSI збігається з незалежною реалізацією',
    Math.abs(ref - rsi(series, 14)!) < 1e-9, `Δ=${Math.abs(ref - rsi(series, 14)!).toExponential(2)}`);

  check('SMA на константі = константа',
    Math.abs(sma(Array.from({ length: 30 }, () => 42), 7)! - 42) < 1e-12);

  const n = 60;
  const highs = Array.from({ length: n }, () => 110);
  const lows = Array.from({ length: n }, () => 90);
  const closes = Array.from({ length: n }, () => 100);
  check('ATR на сталому діапазоні = діапазон', Math.abs(atr(highs, lows, closes, 14)! - 20) < 1e-9);

  check('z-score на константі = null (нульова дисперсія)',
    zScore(Array.from({ length: 25 }, () => 10), 20) === null);
  check('pctFrom рахує відсоток', Math.abs(pctFrom(110, 100)! - 10) < 1e-12);
  check('structure на зростанні = HH-HL',
    structure(Array.from({ length: 20 }, (_, i) => 100 + i),
             Array.from({ length: 20 }, (_, i) => 99 + i), 20) === 'HH-HL');

  /**
   * Найважливіше для тесту аналогів: згладжування Вайлдера залежить від усієї
   * історії, але скрипт подає індикаторам лише трейлінг-вікно WINDOW барів.
   * Перевіряємо, що на 300 барах розбіжність із повною історією нехтовна.
   */
  const long: number[] = [100];
  for (let i = 1; i < 3000; i++) long.push(long[i - 1] * (1 + gauss() * 0.02));
  let maxDiff = 0;
  for (let t = 2800; t < 3000; t++) {
    const full = rsi(long.slice(0, t + 1), 14)!;
    const win = rsi(long.slice(t + 1 - 300, t + 1), 14)!;
    maxDiff = Math.max(maxDiff, Math.abs(full - win));
  }
  check('трейлінг-вікно 300 барів еквівалентне повній історії', maxDiff < 1e-6,
    `maxΔ RSI = ${maxDiff.toExponential(2)}`);
}

// ===========================================================================
console.log('\n2. КАЛІБРУВАННЯ НУЛЯ (сигналу немає — тест має мовчати)\n');
// ===========================================================================

/** Автокорельований ряд станів (як реальні індикатори — плавні). */
function makeStates(n: number, dims: number): number[][] {
  const v: number[][] = [];
  const cur = new Array(dims).fill(0).map(() => gauss());
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dims; d++) cur[d] = cur[d] * 0.95 + gauss() * 0.31;
    v.push([...cur]);
  }
  return v;
}

/** Перекривні h-денні дохідності з денних приростів — сильно автокорельовані. */
function makeOverlappingReturns(n: number, h: number): Float64Array {
  const daily = Array.from({ length: n + h }, () => gauss() * 0.02);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < h; j++) s += daily[i + j];
    out[i] = s;
  }
  return out;
}

{
  seed = 20250901; // кожен блок стартує з власного сіду — інакше зміна
                   // попереднього блоку зсуває весь потік і результати «пливуть»
  const N = 500, DIMS = 10, TRIALS = 20, PERMS = 150, H = 7;
  const dims = Array.from({ length: DIMS }, (_, i) => i);
  const pLog: number[] = [], pDisp: number[] = [], pDir: number[] = [];

  for (let t = 0; t < TRIALS; t++) {
    const vectors = makeStates(N, DIMS);
    const returns = makeOverlappingReturns(N, H); // незалежні від vectors
    const timestamps = Float64Array.from({ length: N }, (_, i) => i * DAY_MS);
    const r = runTest('SYN', H, 'spec', true, vectors, timestamps, returns, dims, PERMS);
    pLog.push(r.pValues!.logScoreGain);
    pDisp.push(r.pValues!.dispersionRatio);
    pDir.push(r.pValues!.dirAccuracy);
  }

  const rate = (p: number[]) => p.filter((x) => x < 0.05).length / p.length;
  const meanOf = (p: number[]) => p.reduce((a, b) => a + b, 0) / p.length;

  // Під нулем p-значення мають бути ~рівномірні: середнє ~0.5, частка
  // хибних спрацювань ~5%. Допуск широкий — 20 прогонів це мало.
  check('logScoreGain: частка хибних спрацювань <= 20%', rate(pLog) <= 0.2,
    `${(rate(pLog) * 100).toFixed(0)}%, середнє p=${meanOf(pLog).toFixed(2)}`);
  check('dispersionRatio: частка хибних спрацювань <= 20%', rate(pDisp) <= 0.2,
    `${(rate(pDisp) * 100).toFixed(0)}%, середнє p=${meanOf(pDisp).toFixed(2)}`);
  check('dirAccuracy: частка хибних спрацювань <= 20%', rate(pDir) <= 0.2,
    `${(rate(pDir) * 100).toFixed(0)}%, середнє p=${meanOf(pDir).toFixed(2)}`);
}

// ===========================================================================
console.log('\n3. ПІДСАДЖЕНИЙ СИГНАЛ (тест має його знайти)\n');
// ===========================================================================

{
  seed = 31337;
  const N = 800, DIMS = 10, PERMS = 300, H = 7;
  const dims = Array.from({ length: DIMS }, (_, i) => i);
  const vectors = makeStates(N, DIMS);
  const timestamps = Float64Array.from({ length: N }, (_, i) => i * DAY_MS);

  // Сигнал у ШИРИНІ діапазону. Перевіряємо в НИЗЬКІЙ розмірності — там,
  // де kNN узагалі має роздільну здатність. Що буває в 10 вимірах —
  // окремий блок 3c нижче, і це не баг, а головний висновок цього тесту.
  // Один вимір: єдина конфігурація, де за n=800 потужності вистачає надійно.
  // Уже за двох вимірів той самий сигнал дає p≈0.10 — див. блок 3c.
  const LOW = 1;
  const lowDims = [0];
  const volReturns = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let drive = 0;
    for (let d = 0; d < LOW; d++) drive += vectors[i][d];
    drive /= Math.sqrt(LOW);
    volReturns[i] = gauss() * (0.002 + 0.08 / (1 + Math.exp(-drive * 6)));
  }
  const volTest = runTest('SYN', H, 'spec', true, vectors, timestamps, volReturns, lowDims, PERMS);
  check('знаходить сигнал у ширині діапазону (1 вимір)', volTest.pValues!.dispersionRatio < 0.01,
    `disp=${volTest.observed.dispersionRatio.toFixed(3)} проти нуля ${volTest.nullMean!.dispersionRatio.toFixed(3)}, p=${volTest.pValues!.dispersionRatio.toFixed(4)}`);
  check('але НЕ вигадує напрямок там, де його нема',
    !(volTest.pValues!.dirAccuracy < 0.01 && volTest.observed.dirAccuracy > volTest.baselineDirAccuracy),
    `dir=${(volTest.observed.dirAccuracy * 100).toFixed(1)}% p=${volTest.pValues!.dirAccuracy.toFixed(4)}`);

  // Сигнал у НАПРЯМКУ: вимір 5 зсуває середнє.
  const dirReturns = new Float64Array(N);
  for (let i = 0; i < N; i++) dirReturns[i] = vectors[i][5] * 0.02 + gauss() * 0.02;
  const dirTest = runTest('SYN', H, 'spec', true, vectors, timestamps, dirReturns, dims, PERMS);
  check('знаходить сигнал у напрямку', dirTest.pValues!.dirAccuracy < 0.01,
    `dir=${(dirTest.observed.dirAccuracy * 100).toFixed(1)}% vs базова ${(dirTest.baselineDirAccuracy * 100).toFixed(1)}% p=${dirTest.pValues!.dirAccuracy.toFixed(4)}`);

  // logScoreGain від'ємний навіть за наявності сигналу — читати його
  // можна лише відносно nullMean. Це властивість оцінки по k сусідах.
  check('logScoreGain читається відносно nullMean, а не нуля',
    dirTest.nullMean !== null && dirTest.observed.logScoreGain > dirTest.nullMean.logScoreGain,
    `спостережене ${dirTest.observed.logScoreGain.toFixed(4)} проти нуля ${dirTest.nullMean!.logScoreGain.toFixed(4)}`);

  // Leave-one-out має вказати саме на вимір 5
  const full = runTest('SYN', H, 'spec', true, vectors, timestamps, dirReturns, dims, 0);
  const drops = dims.map((d) => ({
    d,
    gain: runTest('SYN', H, 'spec', true, vectors, timestamps, dirReturns, dims.filter((x) => x !== d), 0)
      .observed.logScoreGain,
  }));
  const worst = drops.reduce((a, b) => (a.gain < b.gain ? a : b));
  check('leave-one-out вказує на правильний вимір', worst.d === 5,
    `найбільше втрачає без виміру ${worst.d} (${(worst.gain - full.observed.logScoreGain).toFixed(4)})`);
}

// ===========================================================================
console.log('\n3b. ПОТУЖНІСТЬ (що тест взагалі здатний побачити)\n');
// ===========================================================================

{
  seed = 8675309;
  const N = 700, DIMS = 10, H = 7;
  const dims = Array.from({ length: DIMS }, (_, i) => i);
  const vectors = makeStates(N, DIMS);
  const timestamps = Float64Array.from({ length: N }, (_, i) => i * DAY_MS);
  const returns = makeOverlappingReturns(N, H);

  const curve = powerAnalysis(vectors, timestamps, returns, dims, H,
    [0, 0.2, 0.6], 10, 120, 0.05);
  for (const pt of curve) {
    console.log(`     сила ${pt.strength.toFixed(2)} -> виявлено ${(pt.detectionRate * 100).toFixed(0)}%`);
  }
  check('за нульової сили сигналу не спрацьовує', curve[0].detectionRate <= 0.34,
    `${(curve[0].detectionRate * 100).toFixed(0)}%`);
  check('за сильного сигналу спрацьовує', curve[2].detectionRate >= 0.6,
    `${(curve[2].detectionRate * 100).toFixed(0)}%`);
  check('потужність зростає із силою сигналу',
    curve[2].detectionRate >= curve[0].detectionRate);

  // Один релевантний вимір із десяти — саме той випадок, де kNN сліпне.
  const single = new Float64Array(N);
  for (let i = 0; i < N; i++) single[i] = vectors[i][3] * 0.02 + gauss() * 0.02;
  const singleTest = runTest('SYN', H, 'spec', true, vectors, timestamps, single, dims, 200);
  const zTest = runTest('SYN', H, 'z-score', true, zScoreColumns(vectors, dims),
    timestamps, single, dims, 200);
  console.log(`     сигнал в 1 вимірі з 10: p(dir)=${singleTest.pValues!.dirAccuracy.toFixed(3)},` +
    ` після z-score ${zTest.pValues!.dirAccuracy.toFixed(3)}`);
}

// ===========================================================================
console.log('\n3c. ПРОКЛЯТТЯ РОЗМІРНОСТІ (головний висновок)\n');
// ===========================================================================

/**
 * Той самий дуже сильний волатильнісний сигнал, та сама вибірка — міняється
 * лише кількість вимірів і довжина історії. Показує, за яких умов пошук
 * аналогів узагалі має шанс працювати. Це не тест коду, це вимірювання
 * роздільної здатності методу на конфігурації, закладеній у спеку 012.
 */
function plantedVolSeries(vectors: number[][], nDims: number): Float64Array {
  const out = new Float64Array(vectors.length);
  for (let i = 0; i < vectors.length; i++) {
    let drive = 0;
    for (let d = 0; d < nDims; d++) drive += vectors[i][d];
    drive /= Math.sqrt(nDims);
    out[i] = gauss() * (0.002 + 0.08 / (1 + Math.exp(-drive * 6)));
  }
  return out;
}

{
  seed = 424242;
  const H = 7;
  console.log('  Розмірність (n=800):');
  for (const DIMS of [1, 2, 3, 5, 10]) {
    const dims = Array.from({ length: DIMS }, (_, i) => i);
    const vectors = makeStates(800, DIMS);
    const timestamps = Float64Array.from({ length: 800 }, (_, i) => i * DAY_MS);
    const r = plantedVolSeries(vectors, DIMS);
    const t = runTest('DIM', H, 'spec', true, vectors, timestamps, r, dims, 200);
    console.log(`    ${String(DIMS).padStart(2)} вимірів  disp=${t.observed.dispersionRatio.toFixed(3)}` +
      ` (нуль ${t.nullMean!.dispersionRatio.toFixed(3)})  p=${t.pValues!.dispersionRatio.toFixed(4)}`);
  }

  console.log('\n  Довжина історії (10 вимірів):');
  const lengthResults: { n: number; p: number }[] = [];
  for (const N of [800, 3000, 8000]) {
    const dims = Array.from({ length: 10 }, (_, i) => i);
    const vectors = makeStates(N, 10);
    const timestamps = Float64Array.from({ length: N }, (_, i) => i * DAY_MS);
    const r = plantedVolSeries(vectors, 10);
    const t = runTest('LEN', H, 'spec', true, vectors, timestamps, r, dims, 200);
    lengthResults.push({ n: N, p: t.pValues!.dispersionRatio });
    console.log(`    n=${String(N).padStart(5)}  disp=${t.observed.dispersionRatio.toFixed(3)}` +
      ` (нуль ${t.nullMean!.dispersionRatio.toFixed(3)})  p=${t.pValues!.dispersionRatio.toFixed(4)}`);
  }
  check('більше історії -> більше потужності',
    lengthResults[2].p < lengthResults[0].p,
    `p падає з ${lengthResults[0].p.toFixed(3)} до ${lengthResults[2].p.toFixed(3)}`);
}

// ===========================================================================
console.log('\n4. ЗАХИСТ ВІД ВИТІКАННЯ\n');
// ===========================================================================

{
  seed = 112358;
  const N = 600, DIMS = 10, H = 30;
  const dims = Array.from({ length: DIMS }, (_, i) => i);
  const vectors = makeStates(N, DIMS);
  const timestamps = Float64Array.from({ length: N }, (_, i) => i * DAY_MS);
  const returns = makeOverlappingReturns(N, H);

  const causal = runTest('SYN', H, 'spec', true, vectors, timestamps, returns, dims, 0);
  const both = runTest('SYN', H, 'spec', false, vectors, timestamps, returns, dims, 0);
  check('causal-режим дає менше запитів, ніж двобічний', causal.n < both.n,
    `${causal.n} проти ${both.n}`);

  // Вікно виключення має рости з горизонтом — інакше форвардні вікна
  // запиту й сусіда перетинаються і дають хибний сигнал.
  const zscored = zScoreColumns(vectors, dims);
  check('z-score не змінює кількість рядків', zscored.length === vectors.length);
  check('z-score дає нульове середнє', Math.abs(
    zscored.reduce((s, v) => s + v[0], 0) / zscored.length) < 1e-9);
}

// ===========================================================================
console.log(failures === 0 ? '\nУСЕ ПРОЙДЕНО\n' : `\nПРОВАЛЕНО: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
