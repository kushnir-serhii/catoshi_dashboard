import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchMarketData } from '@/lib/marketData';
import { generateForecast } from '@/lib/forecastProvider';
import { FORECAST_GRID_DAYS, PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import type { ForecastPoint, ProjectionData, ProjectionsResponse } from '@/data/types';

// Seeded pseudo-random number generator (mulberry32) for reproducible mock data
function seededRng(seed: number): () => number {
  let s = seed;
  return function (): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simulates the daily compounding price curve out to the furthest day in
// FORECAST_GRID_DAYS, then samples it at each grid offset. This keeps the
// original per-day random-walk curve shape while supporting the new
// non-uniform grid (which reaches out to 365 days).
function buildScenario(startPrice: number, drift: number, seed: number): ForecastPoint[] {
  const rng = seededRng(seed);
  const maxDay = FORECAST_GRID_DAYS[FORECAST_GRID_DAYS.length - 1];
  const gridSet = new Set(FORECAST_GRID_DAYS);
  const points: ForecastPoint[] = [];
  let price = startPrice;
  for (let day = 1; day <= maxDay; day++) {
    const pct = drift + (rng() - 0.5) * 0.025;
    price = price * (1 + pct);
    if (gridSet.has(day)) {
      points.push({ d: day, p: Math.round(price * 100) / 100 });
    }
  }
  return points;
}

interface CoinConfig {
  coin: string;
  currentPrice: number;
  histSeed: number;
  bullDrift: number;
  baseDrift: number;
  bearDrift: number;
  reasoning: string[];
}

const COIN_CONFIGS: CoinConfig[] = [
  {
    coin: 'BTC',
    currentPrice: 97000,
    histSeed: 1001,
    bullDrift: 0.006,
    baseDrift: 0.002,
    bearDrift: -0.004,
    reasoning: [
      'ETF inflows at 3-week high',
      'Fear & Greed neutral at 54',
      'Whale accumulation rising',
    ],
  },
  {
    coin: 'ETH',
    currentPrice: 1800,
    histSeed: 2001,
    bullDrift: 0.007,
    baseDrift: 0.002,
    bearDrift: -0.005,
    reasoning: [
      'Staking yield holding above 4%',
      'Layer-2 TVL up 12% this month',
      'Developer activity at 6-month peak',
    ],
  },
  {
    coin: 'SOL',
    currentPrice: 150,
    histSeed: 3001,
    bullDrift: 0.009,
    baseDrift: 0.003,
    bearDrift: -0.006,
    reasoning: [
      'DEX volume surging on new meme cycle',
      'Network uptime at 99.9% last 30 days',
      'Institutional interest growing via ETF filings',
    ],
  },
];

function buildProjection(cfg: CoinConfig): ProjectionData {
  const bull = buildScenario(cfg.currentPrice, cfg.bullDrift, cfg.histSeed + 10);
  const base = buildScenario(cfg.currentPrice, cfg.baseDrift, cfg.histSeed + 20);
  const bear = buildScenario(cfg.currentPrice, cfg.bearDrift, cfg.histSeed + 30);

  return {
    coin: cfg.coin,
    bull,
    base,
    bear,
    currentPrice: cfg.currentPrice,
    generatedAt: new Date().toISOString(),
    confidence: 72,
    reasoning: cfg.reasoning,
    service: 'claude',
    model: 'claude-sonnet-4-6',
    schemaVersion: PROJECTION_SCHEMA_VERSION,
  };
}

const DEFAULT_SERVICE = 'claude';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function getCachedForecast(service: string, model: string) {
  return unstable_cache(
    async (): Promise<ProjectionsResponse> => {
      const marketData = await fetchMarketData();
      const projections = await generateForecast(service, model, marketData);
      return { projections, generatedAt: new Date().toISOString() };
    },
    ['projections', service, model],
    { revalidate: 21600, tags: ['projections'] },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service') ?? DEFAULT_SERVICE;
  const model = searchParams.get('model') ?? DEFAULT_MODEL;

  // When mock data is enabled, return seeded mock data immediately
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    const projections: ProjectionData[] = COIN_CONFIGS.map(buildProjection);
    return NextResponse.json({ projections, generatedAt: new Date().toISOString() });
  }

  try {
    const cached = getCachedForecast(service, model);
    const response = await cached();
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Forecast generation failed' }, { status: 502 });
  }
}
