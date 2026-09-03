/**
 * Статистичне ядро тесту аналогів. Винесено окремо, щоб його можна було
 * перевірити на синтетиці з ВІДОМОЮ відповіддю (scripts/analog-core.test.ts):
 * шум має давати нуль, підсаджений сигнал — знаходитись.
 */

export const K = 30;
export const BASE_EXCLUSION_DAYS = 30;
export const MIN_CANDIDATES = K * 5;
export const LAPLACE = 1;
export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Побудова вектора стану: службові
// ---------------------------------------------------------------------------

/**
 * Signed ETF-flow streak for the state-vector dimension.
 *
 * `snapshots.etf_streak_days` (from `etfFlows.streakDays`) is an UNSIGNED
 * consecutive-day count — its direction lives in `etf_net_flow_usd`. The
 * spec-014 `etf_streak` rule reads it exactly that way and is correct. The
 * state vector, however, needs a *signed* dimension: an inflow streak and an
 * outflow streak of equal length must sit at opposite ends, not on top of one
 * another. This is the single place that recombines the two columns
 * (decisions.md §8 defect 1; spec 012 technical-considerations §2.1 — resolved
 * in the vector builder, so the migration and the rule are left untouched).
 *
 * Returns `null` when the streak or the flow is missing/non-finite, or when the
 * flow is exactly zero (no direction). The caller substitutes the neutral
 * default — never a spurious signed value. Magnitude is taken from the count,
 * sign purely from the flow, so an already-signed input cannot double-apply.
 */
export function signedEtfStreakDays(
  streakDays: number | null | undefined,
  netFlowUsd: number | null | undefined,
): number | null {
  if (streakDays == null || !Number.isFinite(streakDays)) return null;
  if (netFlowUsd == null || !Number.isFinite(netFlowUsd) || netFlowUsd === 0) return null;
  return Math.sign(netFlowUsd) * Math.abs(streakDays);
}

// ---------------------------------------------------------------------------
// Статистика
// ---------------------------------------------------------------------------

export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Stats {
  dispersionRatio: number;
  dirAccuracy: number;
  logScoreGain: number;
}

export const bucketOf = (r: number, e0: number, e1: number) => (r < e0 ? 0 : r < e1 ? 1 : 2);

/**
 * Три статистики за фіксованими множинами сусідів і заданим рядом дохідностей.
 * Гаряча функція: викликається PERMS разів, тому без зайвих алокацій —
 * scratch-буфер переиспользується між запитами.
 */
export function computeStats(
  neighbors: Int32Array[],
  queries: Int32Array,
  returns: Float64Array,
  e0: number,
  e1: number,
  globalStd: number,
  scratch: Float64Array,
): Stats {
  let dispersionSum = 0;
  let dirHits = 0;
  let logScore = 0;
  const climatology = Math.log(1 / 3);

  for (let qi = 0; qi < queries.length; qi++) {
    const nbr = neighbors[qi];
    const k = nbr.length;

    let sum = 0;
    const counts = [LAPLACE, LAPLACE, LAPLACE];
    for (let j = 0; j < k; j++) {
      const r = returns[nbr[j]];
      scratch[j] = r;
      sum += r;
      counts[bucketOf(r, e0, e1)]++;
    }

    const m = sum / k;
    let varSum = 0;
    for (let j = 0; j < k; j++) varSum += (scratch[j] - m) ** 2;
    dispersionSum += Math.sqrt(varSum / k);

    // медіана сусідів: сортуємо лише перші k елементів scratch
    const slice = Array.prototype.slice.call(scratch, 0, k) as number[];
    slice.sort((a, b) => a - b);
    const med = k % 2 ? slice[(k - 1) >> 1] : (slice[k / 2 - 1] + slice[k / 2]) / 2;

    const actual = returns[queries[qi]];
    if (Math.sign(med) === Math.sign(actual)) dirHits++;

    const total = counts[0] + counts[1] + counts[2];
    logScore += Math.log(counts[bucketOf(actual, e0, e1)] / total);
  }

  const n = queries.length;
  return {
    dispersionRatio: dispersionSum / n / globalStd,
    dirAccuracy: dirHits / n,
    logScoreGain: logScore / n - climatology,
  };
}

/**
 * Множини k найближчих сусідів серед КАНДИДАТІВ (рядків із відомою
 * форвардною дохідністю). causal=true -> лише минуле.
 */
export function findNeighbors(
  vectors: number[][],
  timestamps: Float64Array,
  queries: Int32Array,
  dims: number[],
  exclusionMs: number,
  causal: boolean,
  k: number = K,
): Int32Array[] {
  const n = vectors.length;
  const out: Int32Array[] = [];
  const dist = new Float64Array(n);
  const idx = new Int32Array(n);

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    const qv = vectors[q];
    const qt = timestamps[q];
    let count = 0;

    for (let i = 0; i < n; i++) {
      if (i === q) continue;
      const ti = timestamps[i];
      if (causal ? ti >= qt - exclusionMs : Math.abs(ti - qt) <= exclusionMs) continue;
      const vi = vectors[i];
      let d = 0;
      for (let j = 0; j < dims.length; j++) {
        const diff = vi[dims[j]] - qv[dims[j]];
        d += diff * diff;
      }
      dist[count] = d;
      idx[count] = i;
      count++;
    }

    const order = Array.from({ length: count }, (_, i) => i);
    order.sort((a, b) => dist[a] - dist[b]);
    const kk = Math.min(k, count);
    const picked = new Int32Array(kk);
    for (let j = 0; j < kk; j++) picked[j] = idx[order[j]];
    out.push(picked);
  }
  return out;
}

/** Ознаки з нульовим середнім і одиничною дисперсією (рівні ваги вимірів). */
export function zScoreColumns(vectors: number[][], dims: number[]): number[][] {
  const out = vectors.map((v) => [...v]);
  for (const k of dims) {
    const col = vectors.map((v) => v[k]);
    const m = mean(col);
    const s = std(col) || 1;
    for (let i = 0; i < out.length; i++) out[i][k] = (col[i] - m) / s;
  }
  return out;
}

export interface TestResult {
  asset: string;
  horizon: number;
  weighting: string;
  causal: boolean;
  k: number;
  n: number;
  observed: Stats;
  /**
   * Середнє статистик під нулем. Читати спостережене значення можна ЛИШЕ
   * відносно нього. Зокрема logScoreGain від'ємний навіть за наявності
   * сигналу: оцінка розподілу по k сусідах шумна, і цей шум коштує
   * лог-скору. Нуль порівняння — nullMean, а не 0.
   */
  nullMean: Stats | null;
  pValues: Stats | null;
  baselineDirAccuracy: number;
}

export function runTest(
  asset: string,
  horizon: number,
  weighting: string,
  causal: boolean,
  vectors: number[][],
  timestamps: Float64Array,
  returns: Float64Array,
  dims: number[],
  perms: number,
  k: number = K,
): TestResult {
  const n = vectors.length;
  const exclusionMs = (BASE_EXCLUSION_DAYS + horizon) * DAY_MS;
  const exclusionDays = BASE_EXCLUSION_DAYS + horizon;

  // Запити: у causal-режимі потрібен достатній запас минулого.
  // Ряд — денна сітка, тож позиція в масиві і є кількістю попередніх рядків.
  const qList: number[] = [];
  for (let i = 0; i < n; i++) {
    if (causal && i < exclusionDays + Math.max(MIN_CANDIDATES, k * 5)) continue;
    qList.push(i);
  }
  const queries = Int32Array.from(qList);

  const neighbors = findNeighbors(vectors, timestamps, queries, dims, exclusionMs, causal, k);

  const all = Array.from(returns);
  const sorted = [...all].sort((a, b) => a - b);
  const e0 = quantile(sorted, 1 / 3);
  const e1 = quantile(sorted, 2 / 3);
  const globalStd = std(all);
  const upShare = all.filter((r) => r > 0).length / all.length;

  const scratch = new Float64Array(k);
  const observed = computeStats(neighbors, queries, returns, e0, e1, globalStd, scratch);

  let pValues: Stats | null = null;
  let nullMean: Stats | null = null;
  if (perms > 0) {
    let dispWorse = 0, dirWorse = 0, logWorse = 0;
    let dispSum = 0, dirSum = 0, logSum = 0;
    const minDelta = exclusionDays + horizon;
    const shifted = new Float64Array(n);

    for (let p = 0; p < perms; p++) {
      const delta = minDelta + Math.floor(Math.random() * (n - 2 * minDelta));
      for (let i = 0; i < n; i++) shifted[i] = returns[(i + delta) % n];
      const s = computeStats(neighbors, queries, shifted, e0, e1, globalStd, scratch);
      if (s.dispersionRatio <= observed.dispersionRatio) dispWorse++;
      if (s.dirAccuracy >= observed.dirAccuracy) dirWorse++;
      if (s.logScoreGain >= observed.logScoreGain) logWorse++;
      dispSum += s.dispersionRatio;
      dirSum += s.dirAccuracy;
      logSum += s.logScoreGain;
    }
    pValues = {
      dispersionRatio: (dispWorse + 1) / (perms + 1),
      dirAccuracy: (dirWorse + 1) / (perms + 1),
      logScoreGain: (logWorse + 1) / (perms + 1),
    };
    nullMean = {
      dispersionRatio: dispSum / perms,
      dirAccuracy: dirSum / perms,
      logScoreGain: logSum / perms,
    };
  }

  return {
    asset,
    horizon,
    weighting,
    causal,
    k,
    n: queries.length,
    observed,
    nullMean,
    pValues,
    baselineDirAccuracy: Math.max(upShare, 1 - upShare),
  };
}

/**
 * АНАЛІЗ ПОТУЖНОСТІ — без нього нульовий результат нічого не означає.
 *
 * У 10-вимірному просторі з ~3000 точок kNN має низьку роздільну здатність:
 * якщо з десяти вимірів релевантний лише один, сусіди майже не ближчі за
 * нього, ніж випадкові. Тому «не знайшли сигналу» треба читати разом із
 * «а який сигнал ми взагалі здатні знайти».
 *
 * Метод: у РЕАЛЬНУ геометрію станів підсаджується штучний сигнал відомої
 * сили — дохідність робиться сумішшю справжньої та залежної від стану.
 * strength = 0 -> чистий шум, strength = 1 -> дохідність цілком визначена
 * станом. Повертає найменшу силу, яку тест ловить із заданою надійністю.
 */
export function powerAnalysis(
  vectors: number[][],
  timestamps: Float64Array,
  returns: Float64Array,
  dims: number[],
  horizon: number,
  strengths: number[],
  trials: number,
  perms: number,
  alpha: number,
  k: number = K,
): { strength: number; detectionRate: number }[] {
  const n = returns.length;
  const globalStd = std(Array.from(returns));
  const out: { strength: number; detectionRate: number }[] = [];

  for (const strength of strengths) {
    let detected = 0;
    for (let t = 0; t < trials; t++) {
      // Напрямковий зсув, пропорційний проєкції стану на випадковий
      // напрямок у просторі ознак — найдоброзичливіший до kNN вид сигналу.
      const dir = dims.map(() => Math.random() * 2 - 1);
      const norm = Math.sqrt(dir.reduce((s, x) => s + x * x, 0)) || 1;
      const planted = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let proj = 0;
        for (let j = 0; j < dims.length; j++) proj += vectors[i][dims[j]] * (dir[j] / norm);
        planted[i] = (1 - strength) * returns[i] + strength * proj * globalStd;
      }
      const r = runTest('POWER', horizon, 'spec', true, vectors, timestamps, planted, dims, perms, k);
      const p = r.pValues!;
      if (
        p.logScoreGain < alpha ||
        p.dispersionRatio < alpha ||
        (p.dirAccuracy < alpha && r.observed.dirAccuracy > r.baselineDirAccuracy)
      ) {
        detected++;
      }
    }
    out.push({ strength, detectionRate: detected / trials });
  }
  return out;
}

