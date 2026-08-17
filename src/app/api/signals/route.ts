import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { mockSignalsResponse } from '@/data/signals';
import type { SignalsResponse, SignalItem } from '@/data/types';

export const revalidate = 21600;

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return NextResponse.json(mockSignalsResponse);
  }

  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(20);

    if (error || !data?.length) {
      return NextResponse.json(mockSignalsResponse);
    }

    const signals: SignalItem[] = data.map((row) => ({
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
  } catch {
    return NextResponse.json(mockSignalsResponse);
  }
}
