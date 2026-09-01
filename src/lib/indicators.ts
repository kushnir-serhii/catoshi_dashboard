/**
 * Pure technical-indicator math shared by the snapshot collector (later
 * slices) and any future indicator display code. No I/O, no `Date`, no
 * randomness — every function is a deterministic mapping from its inputs to
 * a single output, so the same input always produces the same output.
 */

/**
 * Relative Strength Index using Wilder's smoothing (RMA), matching
 * TradingView's default RSI(14) — not a simple moving average of gains and
 * losses. The first average gain/loss (over the first `period` deltas) is a
 * plain arithmetic mean; every subsequent average is smoothed via
 * `avg = (prevAvg * (period - 1) + current) / period`.
 *
 * Returns `null` when there are fewer than `period + 1` closes (not enough
 * deltas to seed the first average).
 */
export function rsi(closes: readonly number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gainSum += delta;
    else lossSum += -delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Simple moving average of the last `period` values in `closes`.
 * Returns `null` when there are fewer than `period` values.
 */
export function sma(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period) return null;

  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += closes[i];
  }
  return sum / period;
}

/**
 * Average True Range using Wilder's smoothing on the true-range series
 * (`TR = max(high - low, abs(high - prevClose), abs(low - prevClose))`),
 * seeded the same way as `rsi`: a plain average of the first `period` true
 * ranges, then `avg = (prevAvg * (period - 1) + current) / period`.
 *
 * Returns `null` when the three arrays don't share a length, or there are
 * fewer than `period + 1` bars (not enough true ranges to seed the average).
 */
export function atr(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  period = 14,
): number | null {
  if (highs.length !== lows.length || highs.length !== closes.length) return null;
  if (highs.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const highLow = highs[i] - lows[i];
    const highPrevClose = Math.abs(highs[i] - closes[i - 1]);
    const lowPrevClose = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }

  let avgTr = 0;
  for (let i = 0; i < period; i++) {
    avgTr += trueRanges[i];
  }
  avgTr /= period;

  for (let i = period; i < trueRanges.length; i++) {
    avgTr = (avgTr * (period - 1) + trueRanges[i]) / period;
  }

  return avgTr;
}

/**
 * Z-score of the most recent value in `values` against the mean/population
 * standard deviation of the trailing `lookback` window (the most recent
 * `lookback` values, current value included). Population stddev (divide by
 * `lookback`, not `lookback - 1`) is used since the window is treated as the
 * complete population under study rather than a sample of a larger one.
 *
 * Returns `null` when there are fewer than `lookback` values, or when the
 * window has zero variance (every value identical) — a z-score against zero
 * spread is undefined, so `null` avoids a divide-by-zero rather than
 * fabricating a `0`.
 */
export function zScore(values: readonly number[], lookback = 20): number | null {
  if (values.length < lookback) return null;

  const window = values.slice(values.length - lookback);
  const mean = window.reduce((sum, v) => sum + v, 0) / lookback;
  const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lookback;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;

  const current = values[values.length - 1];
  return (current - mean) / stdDev;
}

/**
 * Percentage distance of `price` from `reference`, e.g. how far the live
 * price sits above/below a moving average: `((price - reference) / reference) * 100`.
 * Returns `null` when `reference` is 0 (avoids a divide-by-zero).
 */
export function pctFrom(price: number, reference: number): number | null {
  if (reference === 0) return null;
  return ((price - reference) / reference) * 100;
}

/**
 * Classifies recent price structure over the trailing `lookback` bars.
 *
 * Method: split the trailing `lookback` bars into an earlier half and a
 * later half (first `Math.floor(lookback / 2)` bars vs. the rest). Compare
 * the later half's max high and min low against the earlier half's:
 * - both the high and the low increased  -> `'HH-HL'` (higher highs/lows)
 * - both the high and the low decreased  -> `'LH-LL'` (lower highs/lows)
 * - anything else (mixed, or unchanged)  -> `'RANGE'`
 *
 * Returns `'RANGE'` when there isn't enough data (fewer than `lookback`
 * bars, or `lookback` too small to split into two non-empty halves).
 */
export function structure(
  highs: readonly number[],
  lows: readonly number[],
  lookback: number,
): 'HH-HL' | 'LH-LL' | 'RANGE' {
  if (highs.length !== lows.length) return 'RANGE';
  if (lookback < 2 || highs.length < lookback) return 'RANGE';

  const windowHighs = highs.slice(highs.length - lookback);
  const windowLows = lows.slice(lows.length - lookback);

  const mid = Math.floor(lookback / 2);
  if (mid === 0 || mid === lookback) return 'RANGE';

  const earlyHighs = windowHighs.slice(0, mid);
  const lateHighs = windowHighs.slice(mid);
  const earlyLows = windowLows.slice(0, mid);
  const lateLows = windowLows.slice(mid);

  const earlyHigh = Math.max(...earlyHighs);
  const lateHigh = Math.max(...lateHighs);
  const earlyLow = Math.min(...earlyLows);
  const lateLow = Math.min(...lateLows);

  if (lateHigh > earlyHigh && lateLow > earlyLow) return 'HH-HL';
  if (lateHigh < earlyHigh && lateLow < earlyLow) return 'LH-LL';
  return 'RANGE';
}
