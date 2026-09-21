/**
 * Logic behind `GET /api/today` (spec 024, technical-considerations §3).
 *
 * Fetchers and the clock are injected so every branch is testable with no
 * network. A failed or stale source never renders a number (README §4 rule 1):
 * every `unavailable` result is built without any numeric field.
 */

import { COLLECT_ASSETS } from '@/consts/collect';
import { COINGECKO_API_KEY_HEADER } from '@/consts/prices';
import {
  TODAY_MIN_BARS,
  TODAY_MODEL_VERSION,
  TODAY_SIGMA_K,
  TODAY_STALE_MINUTES,
  TODAY_VOL_BARS,
} from '@/consts/today';
import type { TodayResponse } from '@/data/types';
import {
  describeKlineFailure,
  type KlineFetchResult,
  type OHLCV,
} from '@/lib/collectors/binanceKlines';
import { ewmaSigmaHourly, scaledSigmaHourly } from '@/lib/todayRange';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Live spot with the timestamp the price was observed at (ms epoch). */
export interface TodaySpot {
  price: number;
  ts: number;
}

export interface TodayDeps {
  /** Fetch `limit` 1h klines for a Binance pair (`fetchKlines(pair, '1h', limit)`). */
  getKlines: (pair: string, limit: number) => Promise<KlineFetchResult>;
  /** Live spot for a CoinGecko id, or null when unavailable. */
  getSpot: (coingeckoId: string) => Promise<TodaySpot | null>;
  /**
   * Track record for the asset (current model version only). Optional: absent
   * means no track. A rejection is caught and reported as `track: null`, so a
   * DB outage never fails the route.
   */
  getTrack?: (coingeckoId: string) => Promise<TodayTrack | null>;
  now: number;
}

export interface TodayTrack {
  n: number;
  held90: number;
  held50: number;
}

/** Bars to request: the window plus one extra for the first return, plus the still-open bar. */
export const TODAY_KLINE_LIMIT = TODAY_VOL_BARS + 2;

function isoOrUndefined(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

export async function buildTodayResponse(assetId: string, deps: TodayDeps): Promise<TodayResponse> {
  const asset = COLLECT_ASSETS.find((a) => a.coingeckoId === assetId);
  if (!asset || TODAY_SIGMA_K[assetId] === undefined) {
    return { status: 'unavailable', reason: 'untracked' };
  }

  const [klines, spot] = await Promise.all([
    deps.getKlines(asset.binancePair, TODAY_KLINE_LIMIT),
    deps.getSpot(assetId),
  ]);

  if (!klines.ok) {
    // Surface the spec-023 failure reason rather than swallowing it.
    return {
      status: 'unavailable',
      reason: 'klines_failed',
      klinesFailure: describeKlineFailure(klines),
    };
  }

  // Drop the still-open bar: only bars whose close time has passed count.
  const closed: OHLCV[] = klines.candles
    .filter((c) => c.closeTime < deps.now)
    .sort((a, b) => a.openTime - b.openTime);

  const newest = closed.length > 0 ? closed[closed.length - 1] : undefined;
  const lastBarMs = newest?.closeTime;
  const lastBarTs = isoOrUndefined(lastBarMs);

  // Staleness is measured from the newest closed bar's close, floored to whole
  // minutes; exactly TODAY_STALE_MINUTES is still fresh (same rule as freshness.ts).
  if (
    lastBarMs === undefined ||
    Math.floor((deps.now - lastBarMs) / 60_000) > TODAY_STALE_MINUTES
  ) {
    return lastBarTs === undefined
      ? { status: 'unavailable', reason: 'insufficient' }
      : { status: 'unavailable', reason: 'stale', lastBarTs };
  }

  if (closed.length < TODAY_MIN_BARS) {
    return { status: 'unavailable', reason: 'insufficient', lastBarTs };
  }

  const rawSigma = ewmaSigmaHourly(closed.map((c) => c.close));
  const sigmaHourly = rawSigma === null ? null : scaledSigmaHourly(rawSigma, assetId);
  if (sigmaHourly === null) {
    return { status: 'unavailable', reason: 'insufficient', lastBarTs };
  }

  // A missing/unreadable/stale spot is reported as `stale` (no dedicated reason
  // exists in the contract); never a fallback to the last bar close.
  if (
    spot === null ||
    !Number.isFinite(spot.price) ||
    spot.price <= 0 ||
    Math.floor((deps.now - spot.ts) / 60_000) > TODAY_STALE_MINUTES
  ) {
    return { status: 'unavailable', reason: 'stale', lastBarTs };
  }

  // Server returns the high/low of the UTC day containing the newest closed bar
  // (as in the type); the client does any local-day derivation itself.
  const dayStart = Math.floor(newest!.openTime / DAY_MS) * DAY_MS;
  const dayBars = closed.filter((c) => c.openTime >= dayStart);
  const dayHighUtc = Math.max(...dayBars.map((c) => c.high));
  const dayLowUtc = Math.min(...dayBars.map((c) => c.low));

  let track: TodayTrack | null = null;
  if (deps.getTrack) {
    try {
      track = await deps.getTrack(assetId);
    } catch (error: unknown) {
      console.error('[todayApi] track record read failed:', error);
    }
  }

  return {
    status: 'ok',
    asset: assetId,
    spot: spot.price,
    spotTs: new Date(spot.ts).toISOString(),
    sigmaHourly,
    k: TODAY_SIGMA_K[assetId],
    modelVersion: TODAY_MODEL_VERSION,
    lastBarTs: lastBarTs as string,
    dayHighUtc,
    dayLowUtc,
    track,
  };
}

/** Default live-spot fetcher: CoinGecko `simple/price` with its own observation time. Server-side only. */
export async function fetchLiveSpot(coingeckoId: string): Promise<TodaySpot | null> {
  const baseUrl = process.env.COINGECKO_BASE_URL;
  if (!baseUrl) return null;
  const apiKey = process.env.COINGECKO_API_KEY;
  try {
    const res = await fetch(
      `${baseUrl}/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=usd&include_last_updated_at=true`,
      {
        next: { revalidate: 60 },
        headers: apiKey ? { [COINGECKO_API_KEY_HEADER]: apiKey } : {},
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
    const entry = body[coingeckoId];
    if (!entry || typeof entry.usd !== 'number' || typeof entry.last_updated_at !== 'number') {
      return null;
    }
    return { price: entry.usd, ts: entry.last_updated_at * 1000 };
  } catch {
    return null;
  }
}
