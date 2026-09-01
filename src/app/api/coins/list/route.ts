import { COINGECKO_API_KEY_HEADER } from '@/consts/prices';
import { NextResponse } from 'next/server';
import type { CoinListItem } from '@/data/types';

const MOCK_COINS: CoinListItem[] = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
  { id: 'solana', symbol: 'sol', name: 'Solana' },
  { id: 'bittensor', symbol: 'tao', name: 'Bittensor' },
  { id: 'chainlink', symbol: 'link', name: 'Chainlink' },
  { id: 'arbitrum', symbol: 'arb', name: 'Arbitrum' },
];

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json({ coins: MOCK_COINS }, { status: 200 });
  }

  const baseUrl = process.env.COINGECKO_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const url = `${baseUrl}/coins/list`;

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey
    ? { [COINGECKO_API_KEY_HEADER]: apiKey }
    : {};

  let response: Response;

  try {
    response = await fetch(url, { next: { revalidate: 86400 }, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch coin list' }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch coin list' }, { status: 502 });
  }

  const data = (await response.json()) as CoinListItem[];
  return NextResponse.json({ coins: data }, { status: 200 });
}
