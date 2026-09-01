import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { mockSignalsResponse } from '@/data/signals';
import type { SignalsResponse, SignalItem } from '@/data/types';

export const revalidate = 21600;

interface SignalRow {
  id: string;
  tag: SignalItem['tag'];
  title: string;
  body: string;
  source: string;
  published_at: string;
  coins: SignalItem['coins'];
}

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockSignalsResponse);
  }

  try {
    const rows = await query<SignalRow>(
      'select * from signals order by published_at desc limit $1',
      [20],
    );

    const signals: SignalItem[] = rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      title: row.title,
      body: row.body,
      source: row.source,
      publishedAt: row.published_at,
      coins: row.coins,
    }));

    const response: SignalsResponse = {
      lastUpdated: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      signals,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    // A dead database (or, currently, a `signals` table that doesn't exist
    // yet in Neon — see spec 010 migration gap) must not silently look like
    // working live data. Log it and return an honest, degraded response
    // instead of dressing up mock data as real.
    console.error('[signals] query failed:', error);

    const response: SignalsResponse = {
      lastUpdated: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      fetchError: true,
      signals: [],
    };

    return NextResponse.json(response);
  }
}
