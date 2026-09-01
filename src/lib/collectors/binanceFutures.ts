/**
 * Binance USDT-M futures derivatives collector — funding rate, open
 * interest, and long/short ratio.
 *
 * Every exported function resolves to `null` on any non-200 response,
 * malformed payload, or network failure — never throws. Per
 * technical-considerations.md §2.3, a missing field is not a run failure
 * (AC 2.2).
 */

const BINANCE_FAPI_BASE = 'https://fapi.binance.com';

/**
 * Funding periods are 8 hours apart on Binance USDT-M futures, so three
 * history entries span roughly 24 hours.
 */
const FUNDING_HISTORY_LIMIT = 3;

interface PremiumIndexResponse {
  lastFundingRate: string;
  markPrice: string;
}

interface FundingRateHistoryEntry {
  fundingRate: string;
  fundingTime: number;
}

interface OpenInterestResponse {
  openInterest: string;
}

interface OpenInterestHistEntry {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

interface LongShortRatioEntry {
  longShortRatio: string;
  timestamp: number;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Current funding rate plus its 24h delta.
 *
 * Method: `lastFundingRate` from `GET fapi/v1/premiumIndex` is the current
 * reading. The delta is `current - rate(~24h ago)`, where the ~24h-ago rate
 * is the OLDEST entry returned by `GET fapi/v1/fundingRate?limit=3` — Binance
 * funds every 8h, so three entries span roughly 24h. If the history call
 * returns fewer than 1 entry, `delta24h` is `null` while `rate` is still
 * returned.
 */
export async function fetchFunding(
  pair: string,
): Promise<{ rate: number; delta24h: number | null } | null> {
  try {
    const currentRes = await fetch(
      `${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(pair)}`,
    );
    if (!currentRes.ok) {
      return null;
    }
    const current = (await currentRes.json()) as unknown as PremiumIndexResponse;
    const rate = Number(current.lastFundingRate);
    if (!isFiniteNumber(rate)) {
      return null;
    }

    let delta24h: number | null = null;
    try {
      const historyRes = await fetch(
        `${BINANCE_FAPI_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(pair)}&limit=${FUNDING_HISTORY_LIMIT}`,
      );
      if (historyRes.ok) {
        const history = (await historyRes.json()) as unknown as FundingRateHistoryEntry[];
        if (Array.isArray(history) && history.length > 0) {
          const oldest = history[0];
          const oldestRate = Number(oldest.fundingRate);
          if (isFiniteNumber(oldestRate)) {
            delta24h = rate - oldestRate;
          }
        }
      }
    } catch {
      delta24h = null;
    }

    return { rate, delta24h };
  } catch {
    return null;
  }
}

/**
 * Current open interest in USD plus its 24h percentage change.
 *
 * Method: `openInterest` (contracts) from `GET fapi/v1/openInterest`
 * multiplied by `markPrice` from `GET fapi/v1/premiumIndex` gives the USD
 * figure. The 24h change is computed from
 * `GET futures/data/openInterestHist?period=1d&limit=2`, comparing the most
 * recent entry's `sumOpenInterestValue` against the prior entry's — both
 * already denominated in quote-asset (USD) value, independent of our own
 * mark-price multiplication above.
 */
export async function fetchOpenInterest(
  pair: string,
): Promise<{ openInterestUsd: number; change24hPct: number | null } | null> {
  try {
    const [oiRes, priceRes] = await Promise.all([
      fetch(`${BINANCE_FAPI_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(pair)}`),
      fetch(`${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(pair)}`),
    ]);
    if (!oiRes.ok || !priceRes.ok) {
      return null;
    }
    const oi = (await oiRes.json()) as unknown as OpenInterestResponse;
    const price = (await priceRes.json()) as unknown as PremiumIndexResponse;
    const contracts = Number(oi.openInterest);
    const markPrice = Number(price.markPrice);
    if (!isFiniteNumber(contracts) || !isFiniteNumber(markPrice)) {
      return null;
    }
    const openInterestUsd = contracts * markPrice;

    let change24hPct: number | null = null;
    try {
      const histRes = await fetch(
        `${BINANCE_FAPI_BASE}/futures/data/openInterestHist?symbol=${encodeURIComponent(pair)}&period=1d&limit=2`,
      );
      if (histRes.ok) {
        const hist = (await histRes.json()) as unknown as OpenInterestHistEntry[];
        if (Array.isArray(hist) && hist.length >= 2) {
          const previous = Number(hist[0].sumOpenInterestValue);
          const latest = Number(hist[hist.length - 1].sumOpenInterestValue);
          if (isFiniteNumber(previous) && isFiniteNumber(latest) && previous !== 0) {
            change24hPct = ((latest - previous) / previous) * 100;
          }
        }
      }
    } catch {
      change24hPct = null;
    }

    return { openInterestUsd, change24hPct };
  } catch {
    return null;
  }
}

/**
 * Most recent global long/short account ratio, `period=1h`, from
 * `GET futures/data/globalLongShortAccountRatio`.
 */
export async function fetchLongShortRatio(pair: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${BINANCE_FAPI_BASE}/futures/data/globalLongShortAccountRatio?symbol=${encodeURIComponent(pair)}&period=1h&limit=1`,
    );
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as unknown as LongShortRatioEntry[];
    if (!Array.isArray(body) || body.length === 0) {
      return null;
    }
    const ratio = Number(body[body.length - 1].longShortRatio);
    return isFiniteNumber(ratio) ? ratio : null;
  } catch {
    return null;
  }
}
