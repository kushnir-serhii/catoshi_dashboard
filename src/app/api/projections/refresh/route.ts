import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import type { ForecastTarget } from '@/consts/projections';
import {
  DEFAULT_FORECAST_TARGETS,
  FORECAST_GRID_DAYS,
  PROJECTION_SCHEMA_VERSION,
} from '@/consts/projections';
import type { ForecastPoint, ProjectionData, ProjectionsResponse } from '@/data/types';
import { generateForecast } from '@/lib/forecastProvider';
import { fetchMarketData } from '@/lib/marketData';

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
  scenarioProbabilities: { bull: number; base: number; bear: number };
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
    scenarioProbabilities: { bull: 30, base: 50, bear: 20 },
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
    scenarioProbabilities: { bull: 32, base: 46, bear: 22 },
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
    scenarioProbabilities: { bull: 35, base: 40, bear: 25 },
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
    scenarioProbabilities: cfg.scenarioProbabilities,
    reasoning: cfg.reasoning,
    service: 'claude',
    model: 'claude-sonnet-4-6',
    schemaVersion: PROJECTION_SCHEMA_VERSION,
  };
}

/** Deterministic string hash, used to seed mock data for coins outside
 * `COIN_CONFIGS` so mock mode still works when reforecasting an arbitrary coin. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function buildMockProjectionForCoin(target: ForecastTarget): ProjectionData {
  const known = COIN_CONFIGS.find((cfg) => cfg.coin === target.symbol);
  if (known) return buildProjection(known);

  const seed = hashString(target.id);
  const rng = seededRng(seed);
  // Plausible-looking price across small-cap to large-cap ranges, derived
  // deterministically from the coin id so re-mocking the same coin is stable.
  const currentPrice = Math.round(10 ** (rng() * 5) * 100) / 100;
  const bull = 25 + Math.round(rng() * 15);
  const bear = 15 + Math.round(rng() * 15);

  return buildProjection({
    coin: target.symbol,
    currentPrice,
    histSeed: seed % 100000,
    bullDrift: 0.006 + rng() * 0.004,
    baseDrift: 0.001 + rng() * 0.003,
    bearDrift: -0.003 - rng() * 0.004,
    reasoning: [
      `Mock projection for ${target.name} (no live data — NEXT_PUBLIC_USE_MOCK_DATA is set)`,
    ],
    scenarioProbabilities: { bull, base: 100 - bull - bear, bear },
  });
}

const ALLOWED: Record<string, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

const DEFAULT_SERVICE = 'claude';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function validateParams(service: string, model: string): { service: string; model: string } {
  const allowedModels = ALLOWED[service];
  if (!allowedModels || !allowedModels.includes(model)) {
    return { service: DEFAULT_SERVICE, model: DEFAULT_MODEL };
  }
  return { service, model };
}

interface RefreshRequestBody {
  service?: string;
  model?: string;
  /** When present, only this one coin is (re)forecasted instead of the
   * default tracked batch — used by the chart's and Scenario Simulator's
   * per-coin "Reforecast" actions, so switching to an arbitrary coin only
   * costs an AI call when the user actually asks for one. */
  coin?: { id?: string; symbol?: string; name?: string };
}

function isValidTarget(coin: RefreshRequestBody['coin']): coin is ForecastTarget {
  return (
    !!coin &&
    typeof coin.id === 'string' &&
    coin.id.length > 0 &&
    typeof coin.symbol === 'string' &&
    coin.symbol.length > 0 &&
    typeof coin.name === 'string' &&
    coin.name.length > 0
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RefreshRequestBody = {};
  try {
    body = (await request.json()) as RefreshRequestBody;
  } catch {
    // body remains empty — use defaults
  }

  const { service, model } = validateParams(
    body.service ?? DEFAULT_SERVICE,
    body.model ?? DEFAULT_MODEL,
  );

  const singleTarget: ForecastTarget | null = isValidTarget(body.coin)
    ? { id: body.coin.id, symbol: body.coin.symbol.toUpperCase(), name: body.coin.name }
    : null;

  // Bust the ISR cache for all projections
  revalidateTag('projections', { expire: 0 });

  // When mock data is enabled, return seeded mock data immediately
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    const projections: ProjectionData[] = singleTarget
      ? [buildMockProjectionForCoin(singleTarget)]
      : COIN_CONFIGS.map(buildProjection);
    const response: ProjectionsResponse = { projections, generatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  }

  const targets = singleTarget ? [singleTarget] : DEFAULT_FORECAST_TARGETS;

  try {
    const marketData = await fetchMarketData(targets);
    const result = await generateForecast(service, model, marketData, targets);
    const response: ProjectionsResponse = {
      projections: result.projections,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Forecast refresh failed' }, { status: 500 });
  }
}
