import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import type { ForecastTarget } from '@/consts/projections';
import { DEFAULT_FORECAST_TARGETS, FORECAST_TTL_SECONDS } from '@/consts/projections';
import {
  buildForecastInputs,
  type SerializedForecastInputs,
  serializeForecastInputs,
} from '@/lib/forecast/inputs';
import { COIN_CONFIGS } from '@/lib/forecast/mock';
import { checkIngestAuth } from '@/lib/ingestAuth';
import { fetchMarketData, type MarketData } from '@/lib/marketData';

/**
 * `GET /api/projections/inputs` (spec 020, Slice 1).
 *
 * Exposes the exact prompt-input assembly the paid providers use
 * (`buildForecastInputs`) so a scheduled Claude task can produce a forecast
 * batch itself, at zero provider cost, and POST it to `/api/projections/ingest`.
 *
 * - Machine-to-machine auth only: `Authorization: Bearer <FORECAST_INGEST_SECRET>`.
 *   Unauthorized → 401 with no upstream fetch. Unset secret → 503.
 * - Never calls a model. Wraps `fetchMarketData` in `unstable_cache` on the
 *   same 6-hour `'projections'` tag family the GET/refresh routes use, so an
 *   unauthenticated flood cannot turn this into a CoinGecko/RSS amplifier
 *   (technical-considerations §2.1).
 */

/** Flat mock market data so the endpoint keeps its shape without a network call. */
function buildMockMarketData(targets: readonly ForecastTarget[]): MarketData {
  const historicalPrices: Record<string, number[]> = {};
  for (const target of targets) {
    const price = COIN_CONFIGS.find((cfg) => cfg.coin === target.symbol)?.currentPrice ?? 100;
    historicalPrices[target.id] = Array.from({ length: 90 }, () => price);
  }
  return {
    news: 'Mock news headlines (NEXT_PUBLIC_USE_MOCK_DATA is set)',
    fearGreed: 'Neutral(54)',
    trending: 'Bitcoin(BTC), Ethereum(ETH), Solana(SOL)',
    reddit: 'Mock Reddit sentiment (NEXT_PUBLIC_USE_MOCK_DATA is set)',
    historicalPrices,
  };
}

const getCachedInputs = unstable_cache(
  async (): Promise<SerializedForecastInputs> => {
    const marketData = await fetchMarketData(DEFAULT_FORECAST_TARGETS);
    return serializeForecastInputs(buildForecastInputs(marketData, DEFAULT_FORECAST_TARGETS));
  },
  ['projection-inputs'],
  { revalidate: FORECAST_TTL_SECONDS, tags: ['projections'] },
);

export async function GET(request: Request): Promise<NextResponse> {
  const auth = checkIngestAuth(request);
  if (auth === 'unconfigured') {
    return NextResponse.json({ error: 'Forecast ingest not configured' }, { status: 503 });
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    const marketData = buildMockMarketData(DEFAULT_FORECAST_TARGETS);
    return NextResponse.json(
      serializeForecastInputs(buildForecastInputs(marketData, DEFAULT_FORECAST_TARGETS)),
    );
  }

  try {
    return NextResponse.json(await getCachedInputs());
  } catch {
    return NextResponse.json({ error: 'Failed to assemble forecast inputs' }, { status: 502 });
  }
}
