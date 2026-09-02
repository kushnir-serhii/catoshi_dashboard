import { RSS_FEEDS } from '@/consts/news';
import type { ForecastTarget } from '@/consts/projections';
import { DEFAULT_FORECAST_TARGETS } from '@/consts/projections';

export interface MarketData {
  news: string;
  fearGreed: string;
  trending: string;
  reddit: string;
  /** Keyed by CoinGecko id, one entry per requested forecast target. */
  historicalPrices: Record<string, number[]>;
}

const COINGECKO_BASE_URL = process.env.COINGECKO_BASE_URL ?? 'https://api.coingecko.com/api/v3';

async function fetchNewsHeadlines(): Promise<string> {
  try {
    const results = await Promise.all(
      RSS_FEEDS.map(async (url) => {
        try {
          const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=5`;
          const res = await fetch(endpoint, { next: { revalidate: 900 } });
          if (!res.ok) return '';
          const data = (await res.json()) as {
            items?: Array<{ title?: string }>;
          };
          return (data.items ?? [])
            .map((item) => item.title ?? '')
            .filter(Boolean)
            .join(' | ');
        } catch {
          return '';
        }
      }),
    );
    const combined = results.filter(Boolean).join(' | ');
    return combined || 'No news available';
  } catch {
    return 'News fetch failed';
  }
}

async function fetchFearGreed(): Promise<string> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=7', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 'Fear & Greed unavailable';
    const data = (await res.json()) as {
      data?: Array<{ value?: string; value_classification?: string }>;
    };
    const entries = (data.data ?? [])
      .map((d) => `${d.value_classification ?? ''}(${d.value ?? ''})`)
      .join(', ');
    return entries || 'Fear & Greed unavailable';
  } catch {
    return 'Fear & Greed fetch failed';
  }
}

async function fetchTrending(): Promise<string> {
  try {
    const res = await fetch(`${COINGECKO_BASE_URL}/search/trending`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return 'Trending unavailable';
    const data = (await res.json()) as {
      coins?: Array<{ item?: { name?: string; symbol?: string } }>;
    };
    const coins = (data.coins ?? [])
      .map((c) => `${c.item?.name ?? ''}(${c.item?.symbol ?? ''})`)
      .join(', ');
    return coins || 'Trending unavailable';
  } catch {
    return 'Trending fetch failed';
  }
}

async function fetchRedditSentiment(): Promise<string> {
  try {
    const res = await fetch('https://www.reddit.com/r/CryptoCurrency/hot.json?limit=10', {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return 'Reddit unavailable';
    const data = (await res.json()) as {
      data?: { children?: Array<{ data?: { title?: string } }> };
    };
    const posts = (data.data?.children ?? [])
      .map((c) => c.data?.title ?? '')
      .filter(Boolean)
      .join(' | ');
    return posts || 'Reddit unavailable';
  } catch {
    return 'Reddit fetch failed';
  }
}

async function fetchCoinHistory(coinId: string): Promise<number[]> {
  try {
    const url = `${COINGECKO_BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=90&interval=daily`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      prices?: Array<[number, number]>;
    };
    return (data.prices ?? []).map(([, price]) => price);
  } catch {
    return [];
  }
}

export async function fetchMarketData(
  targets: readonly ForecastTarget[] = DEFAULT_FORECAST_TARGETS,
): Promise<MarketData> {
  const [news, fearGreed, trending, reddit, histories] = await Promise.all([
    fetchNewsHeadlines(),
    fetchFearGreed(),
    fetchTrending(),
    fetchRedditSentiment(),
    Promise.all(targets.map((t) => fetchCoinHistory(t.id))),
  ]);

  const historicalPrices: Record<string, number[]> = {};
  targets.forEach((t, i) => {
    historicalPrices[t.id] = histories[i];
  });

  return { news, fearGreed, trending, reddit, historicalPrices };
}
