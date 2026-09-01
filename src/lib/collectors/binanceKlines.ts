/**
 * Binance USDT-M futures klines (OHLCV) collector.
 *
 * Any non-200 response or network failure resolves to `null` rather than
 * throwing — per technical-considerations.md §2.3, "treat any non-200 as a
 * missing field rather than a run failure" (AC 2.2). Callers must not `await`
 * this expecting a rejection on failure; they get `null` instead.
 */
import { COLLECT_TIMEFRAMES, type CollectTimeframe } from '@/consts/collect';

const BINANCE_FAPI_BASE = 'https://fapi.binance.com';

/** One OHLCV candle, numeric fields parsed from Binance's string payload. */
export interface OHLCV {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Raw shape of one row in Binance's `GET fapi/v1/klines` response:
 * `[openTime, open, high, low, close, volume, closeTime, quoteVolume,
 * trades, takerBuyBaseVolume, takerBuyQuoteVolume, ignore]`. All numeric
 * fields arrive as strings except the two timestamps and `trades`.
 */
type RawKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

function isRawKline(value: unknown): value is RawKline {
  return Array.isArray(value) && value.length >= 7;
}

/**
 * Fetches `limit` candles for `pair` at `interval` from Binance USDT-M
 * futures. Resolves to `null` on any non-200 status, network error, or
 * malformed payload — never throws.
 */
export async function fetchKlines(
  pair: string,
  interval: string,
  limit: number,
): Promise<OHLCV[] | null> {
  try {
    const url = `${BINANCE_FAPI_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      return null;
    }
    const candles: OHLCV[] = [];
    for (const row of body) {
      if (!isRawKline(row)) {
        return null;
      }
      candles.push({
        openTime: row[0],
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: row[6],
      });
    }
    return candles;
  } catch {
    return null;
  }
}

/** One timeframe's klines result, `null` when that fetch failed. */
export type KlinesByTimeframe = Partial<Record<CollectTimeframe, OHLCV[] | null>>;

/**
 * Fetches all `COLLECT_TIMEFRAMES` for one pair in parallel. This is the
 * per-timeframe-parallel half of the "per-asset sequential, per-timeframe
 * parallel" fetch pattern (technical-considerations.md §2.3) — a future
 * `snapshotBuilder.ts` loops assets sequentially and calls this once per
 * asset.
 */
export async function fetchAllTimeframes(
  pair: string,
  limit: number,
): Promise<KlinesByTimeframe> {
  const entries = await Promise.all(
    COLLECT_TIMEFRAMES.map(async (timeframe) => {
      const candles = await fetchKlines(pair, timeframe, limit);
      return [timeframe, candles] as const;
    }),
  );
  const result: KlinesByTimeframe = {};
  for (const [timeframe, candles] of entries) {
    result[timeframe] = candles;
  }
  return result;
}
