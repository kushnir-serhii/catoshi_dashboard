import { NextResponse } from 'next/server';
import type { MarketListItem } from '@/data/types';
import { MARKETS_PAGE_SIZE, COINGECKO_API_KEY_HEADER } from '@/consts/prices';

const MOCK_MARKETS: MarketListItem[] = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    current_price: 69750.40,
    price_change_percentage_24h: 1.84,
    market_cap: 1370000000000,
    total_volume: 28400000000,
    sparkline_in_7d: { price: [65000, 66200, 67100, 68500, 67800, 69100, 69750] },
  },
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    current_price: 4140.18,
    price_change_percentage_24h: 2.62,
    market_cap: 497000000000,
    total_volume: 14100000000,
    sparkline_in_7d: { price: [3800, 3900, 4000, 4050, 3980, 4100, 4140] },
  },
  {
    id: 'solana',
    symbol: 'sol',
    name: 'Solana',
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    current_price: 259.04,
    price_change_percentage_24h: -0.78,
    market_cap: 118000000000,
    total_volume: 3200000000,
    sparkline_in_7d: { price: [240, 248, 255, 262, 258, 261, 259] },
  },
  {
    id: 'bittensor',
    symbol: 'tao',
    name: 'Bittensor',
    image: 'https://assets.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg',
    current_price: 456.20,
    price_change_percentage_24h: 5.20,
    market_cap: 3400000000,
    total_volume: 220000000,
    sparkline_in_7d: { price: [400, 415, 430, 440, 435, 450, 456] },
  },
  {
    id: 'chainlink',
    symbol: 'link',
    name: 'Chainlink',
    image: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    current_price: 22.41,
    price_change_percentage_24h: 0.41,
    market_cap: 13600000000,
    total_volume: 540000000,
    sparkline_in_7d: { price: [21.0, 21.5, 22.0, 22.3, 22.1, 22.4, 22.41] },
  },
];

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(MOCK_MARKETS, { status: 200 });
  }

  const baseUrl = process.env.COINGECKO_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 502 });
  }

  const url =
    `${baseUrl}/coins/markets` +
    `?vs_currency=usd` +
    `&order=market_cap_desc` +
    `&per_page=${MARKETS_PAGE_SIZE}` +
    `&page=1` +
    `&sparkline=true` +
    `&price_change_percentage=24h`;

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey
    ? { [COINGECKO_API_KEY_HEADER]: apiKey }
    : {};

  let response: Response;

  try {
    response = await fetch(url, { next: { revalidate: 60 }, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 502 });
  }

  const raw: unknown = await response.json();

  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'Unexpected response from upstream' }, { status: 502 });
  }

  const data: MarketListItem[] = (raw as Array<Record<string, unknown>>).map((item) => ({
    id: String(item['id'] ?? ''),
    symbol: String(item['symbol'] ?? ''),
    name: String(item['name'] ?? ''),
    image: String(item['image'] ?? ''),
    current_price: Number(item['current_price'] ?? 0),
    price_change_percentage_24h: Number(item['price_change_percentage_24h'] ?? 0),
    market_cap: Number(item['market_cap'] ?? 0),
    total_volume: Number(item['total_volume'] ?? 0),
    sparkline_in_7d: {
      price: Array.isArray(
        (item['sparkline_in_7d'] as Record<string, unknown> | null | undefined)?.['price'],
      )
        ? ((item['sparkline_in_7d'] as Record<string, unknown>)['price'] as number[])
        : [],
    },
  }));

  return NextResponse.json(data, { status: 200 });
}
