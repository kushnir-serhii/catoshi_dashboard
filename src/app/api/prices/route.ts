import { COINGECKO_API_KEY_HEADER } from '@/consts/prices';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get('ids');

  if (!ids || ids.trim() === '') {
    return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
  }

  const baseUrl = process.env.COINGECKO_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 });
  }

  const url = `${baseUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey
    ? { [COINGECKO_API_KEY_HEADER]: apiKey }
    : {};

  let response: Response;

  try {
    response = await fetch(url, { next: { revalidate: 60 }, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 });
  }

  const data: unknown = await response.json();
  return NextResponse.json(data, { status: 200 });
}
