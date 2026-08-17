import { NextResponse } from 'next/server';
import type { HistoricalPrice } from '@/data/types';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const days = searchParams.get('days');

  if (!id || id.trim() === '') {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  if (!days || days.trim() === '') {
    return NextResponse.json({ error: 'Missing days parameter' }, { status: 400 });
  }

  // Mock mode guard
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    const { getMockHistoricalPrices } = await import('@/data/historicalPrices');
    const result = getMockHistoricalPrices(id, Number(days));
    return NextResponse.json({ prices: result }, { status: 200 });
  }

  const baseUrl = process.env.COINGECKO_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const url = `${baseUrl}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey
    ? { 'x-cg-pro-api-key': apiKey }
    : {};

  let response: Response;

  try {
    response = await fetch(url, { next: { revalidate: 3600 }, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch price history' }, { status: 502 });
  }

  if (response.status === 429) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    );
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch price history' }, { status: 502 });
  }

  const raw = (await response.json()) as { prices: [number, number][] };

  const prices: HistoricalPrice[] = raw.prices.map(([timestamp, price]) => ({
    timestamp,
    price,
  }));

  return NextResponse.json({ prices }, { status: 200 });
}
