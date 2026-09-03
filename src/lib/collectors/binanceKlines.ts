/**
 * Binance USDT-M futures klines (OHLCV) collector.
 *
 * Any non-200 response or network failure resolves to `null` rather than
 * throwing — per technical-considerations.md §2.3, "treat any non-200 as a
 * missing field rather than a run failure" (AC 2.2). Callers must not `await`
 * this expecting a rejection on failure; they get `null` instead.
 */
import {
  BACKFILL_KLINE_LIMIT,
  BACKFILL_MAX_RATE_LIMIT_RETRIES,
  BACKFILL_RATE_LIMIT_BACKOFF_MS,
  BACKFILL_REQUEST_SPACING_MS,
  COLLECT_TIMEFRAMES,
  type CollectTimeframe,
} from '@/consts/collect';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches one page of up to `BACKFILL_KLINE_LIMIT` candles for `pair` at
 * `interval` ending at or before `endTime` (ms epoch). Pauses and retries on
 * HTTP 429/418 — honouring the `Retry-After` header when present, otherwise
 * `BACKFILL_RATE_LIMIT_BACKOFF_MS` — up to `BACKFILL_MAX_RATE_LIMIT_RETRIES`
 * times, then resolves to `null`. Any other non-200, network error or
 * malformed payload also resolves to `null` — never throws.
 */
async function fetchKlinesPage(
  pair: string,
  interval: string,
  endTime: number,
): Promise<OHLCV[] | null> {
  const url =
    `${BINANCE_FAPI_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(pair)}` +
    `&interval=${encodeURIComponent(interval)}&limit=${BACKFILL_KLINE_LIMIT}` +
    `&endTime=${endTime}`;

  for (let attempt = 0; attempt <= BACKFILL_MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return null;
    }

    if (res.status === 429 || res.status === 418) {
      if (attempt === BACKFILL_MAX_RATE_LIMIT_RETRIES) {
        return null;
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BACKFILL_RATE_LIMIT_BACKOFF_MS;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
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
  }

  return null;
}

/**
 * Full candle history for `pair` at `interval` across `[startTime, endTime]`
 * (ms epoch, inclusive), assembled by **backwards** pagination: pages of
 * `BACKFILL_KLINE_LIMIT` candles are fetched newest-first, walking the cursor
 * back from `endTime` to just before each page's oldest `openTime`, until
 * `startTime` is covered or the feed runs out. Requests are spaced by
 * `BACKFILL_REQUEST_SPACING_MS` and issued strictly sequentially — callers
 * must never run this for two assets in parallel (technical-considerations.md
 * §2.4).
 *
 * Returns candles in ascending `openTime` order, de-duplicated, none before
 * `startTime` or after `endTime`. Resolves to `null` if any page fails (a
 * non-recoverable non-200, network error or malformed payload) — never throws.
 */
export async function fetchKlinesRange(
  pair: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<OHLCV[] | null> {
  const byOpenTime = new Map<number, OHLCV>();
  let cursor = endTime;

  for (;;) {
    const page = await fetchKlinesPage(pair, interval, cursor);
    if (page === null) {
      return null;
    }
    if (page.length === 0) {
      break;
    }

    let oldest = cursor;
    for (const candle of page) {
      if (candle.openTime >= startTime && candle.openTime <= endTime) {
        byOpenTime.set(candle.openTime, candle);
      }
      if (candle.openTime < oldest) {
        oldest = candle.openTime;
      }
    }

    if (oldest <= startTime) {
      break;
    }

    const nextCursor = oldest - 1;
    if (nextCursor >= cursor) {
      // No backward progress — stop rather than loop forever.
      break;
    }
    cursor = nextCursor;
    await sleep(BACKFILL_REQUEST_SPACING_MS);
  }

  return [...byOpenTime.values()].sort((a, b) => a.openTime - b.openTime);
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
export async function fetchAllTimeframes(pair: string, limit: number): Promise<KlinesByTimeframe> {
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
