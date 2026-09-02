import type { HistoricalPrice } from './types';

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const DAYS = 365;
const MS_PER_DAY = 86_400_000;

// Generates a deterministic pseudo-random walk of `DAYS` daily prices, then
// rescales the whole series so the most recent point lands exactly on
// `latestPrice` — keeping the walk's shape/volatility while staying in the
// same ballpark as the mock live prices used elsewhere.
function generatePrices(seed: number, latestPrice: number): HistoricalPrice[] {
  const rnd = seededRand(seed);
  const startTs = Date.now() - DAYS * MS_PER_DAY;
  const prices: HistoricalPrice[] = [];
  let price = 1;
  for (let i = 0; i < DAYS; i++) {
    price *= 1 + (rnd() - 0.5) * 0.04;
    prices.push({ timestamp: startTs + i * MS_PER_DAY, price });
  }

  const scale = latestPrice / prices[prices.length - 1].price;
  return prices.map((point) => ({ ...point, price: point.price * scale }));
}

const MOCK_DATA: Record<string, HistoricalPrice[]> = {
  bitcoin: generatePrices(42, 69_750.4),
  ethereum: generatePrices(7, 4_140.18),
  solana: generatePrices(13, 259.04),
};

export function getMockHistoricalPrices(coinId: string, days: number): HistoricalPrice[] {
  const full = MOCK_DATA[coinId];
  if (!full) return [];
  return full.slice(-days);
}
