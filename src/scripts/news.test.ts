/**
 * Ingest tests for spec 015, Slice 3 (technical-considerations §4, "Unit").
 *
 * Run:  npx tsx src/scripts/news.test.ts
 *
 * No database, no network — URL normalisation, hashing and the age-window
 * cutoff are pure functions, so plain fixtures and assertions are enough.
 * Exits non-zero on failure (pattern: src/scripts/signal-rules.test.ts).
 */

import { NEWS_INGEST_WINDOW_HOURS } from '@/consts/news';
import {
  hashUrl,
  isWithinIngestWindow,
  normalizeUrl,
  toIngestedItem,
} from '@/lib/collectors/newsFeed';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const HOUR_MS = 3_600_000;
const NOW = new Date('2026-09-02T12:00:00.000Z');

// ---------------------------------------------------------------------------
section('URL normalisation');
// ---------------------------------------------------------------------------

check(
  'strips utm_* parameters',
  normalizeUrl('https://coindesk.com/article?utm_source=twitter&utm_medium=social') ===
    'https://coindesk.com/article',
);
check(
  'strips single-name trackers (fbclid, gclid, ref, mc_cid, igshid)',
  normalizeUrl('https://decrypt.co/x?fbclid=abc&gclid=def&ref=hn&mc_cid=1&mc_eid=2&igshid=z') ===
    'https://decrypt.co/x',
);
check(
  'keeps a genuine content parameter',
  normalizeUrl('https://site.com/p?id=42&utm_campaign=x') === 'https://site.com/p?id=42',
);
check(
  'sorts retained query parameters so order does not matter',
  normalizeUrl('https://site.com/p?b=2&a=1') === normalizeUrl('https://site.com/p?a=1&b=2'),
);
check(
  'lowercases the host',
  normalizeUrl('https://CoinDesk.COM/Article') === 'https://coindesk.com/Article',
);
check(
  'drops the fragment',
  normalizeUrl('https://site.com/post#section-3') === 'https://site.com/post',
);
check(
  'drops a trailing slash on the path',
  normalizeUrl('https://site.com/post/') === 'https://site.com/post',
);
check(
  'keeps path case (only the host is case-folded)',
  normalizeUrl('https://site.com/Path/To/Article') === 'https://site.com/Path/To/Article',
);

// ---------------------------------------------------------------------------
section('Hash collapse — two spellings of one article → one hash');
// ---------------------------------------------------------------------------

{
  const canonical = 'https://www.coindesk.com/markets/2026/09/02/btc-etf-inflows';
  const spellings = [
    canonical,
    `${canonical}?utm_source=newsletter&utm_campaign=daily`,
    `${canonical}/#top`,
    `${canonical}?fbclid=IwAR123`,
    canonical.replace('https://www.coindesk.com', 'https://www.CoinDesk.com'),
  ];
  const hashes = new Set(spellings.map((url) => hashUrl(normalizeUrl(url))));
  check('all five spellings collapse to one hash', hashes.size === 1, `got ${hashes.size}`);

  const different = hashUrl(normalizeUrl(`${canonical}-2`));
  check('a genuinely different URL hashes differently', !hashes.has(different));
  check('hash is 64 hex chars (sha256)', /^[0-9a-f]{64}$/.test([...hashes][0]));
}

// ---------------------------------------------------------------------------
section('Ingest age window');
// ---------------------------------------------------------------------------

check(
  'an article published just now is in-window',
  isWithinIngestWindow(new Date(NOW.getTime() - HOUR_MS), NOW),
);
check(
  'exactly at the window boundary is in-window',
  isWithinIngestWindow(new Date(NOW.getTime() - NEWS_INGEST_WINDOW_HOURS * HOUR_MS), NOW),
);
check(
  'one hour past the window is discarded',
  !isWithinIngestWindow(new Date(NOW.getTime() - (NEWS_INGEST_WINDOW_HOURS + 1) * HOUR_MS), NOW),
);
check(
  'a future-dated article (feed clock skew) is kept',
  isWithinIngestWindow(new Date(NOW.getTime() + 2 * HOUR_MS), NOW),
);

// ---------------------------------------------------------------------------
section('toIngestedItem — mapping and cutoff');
// ---------------------------------------------------------------------------

const FEED = 'https://www.coindesk.com/arc/outboundfeeds/rss/';

{
  const fresh = toIngestedItem(
    {
      title: '  BTC ETF sees record inflows  ',
      link: 'https://www.coindesk.com/markets/btc-etf?utm_source=rss#hero',
      pubDate: '2026-09-02 09:30:00',
    },
    FEED,
    NOW,
  );
  check('maps a fresh item', fresh !== null);
  check('title is trimmed', fresh?.title === 'BTC ETF sees record inflows');
  check(
    'url is the normalised canonical form',
    fresh?.url === 'https://www.coindesk.com/markets/btc-etf',
  );
  check('source is the feed label', fresh?.source === 'coindesk');
  check('feedUrl is retained', fresh?.feedUrl === FEED);
  check(
    'publishedAt is the feed time as ISO/UTC, not ingest time',
    fresh?.publishedAt === '2026-09-02T09:30:00.000Z',
  );
  check(
    'raw item is retained',
    (fresh?.raw as { title?: string })?.title?.includes('BTC') === true,
  );
}

check(
  'an item older than the window is dropped',
  toIngestedItem(
    { title: 'Old news', link: 'https://decrypt.co/old', pubDate: '2026-08-01 00:00:00' },
    FEED,
    NOW,
  ) === null,
);
check(
  'publishedAt is the article time even when ingested much later (ageing uses published_at)',
  (() => {
    // Published 40h before ingest — still inside the 48h window, but plainly
    // not "now". The stored timestamp must be the article's, not the run's.
    const lateNow = new Date(NOW.getTime() + 40 * HOUR_MS);
    const item = toIngestedItem(
      { title: 'x', link: 'https://decrypt.co/x', pubDate: '2026-09-02 12:00:00' },
      FEED,
      lateNow,
    );
    return item?.publishedAt === '2026-09-02T12:00:00.000Z';
  })(),
);
check(
  'missing link → dropped',
  toIngestedItem({ title: 'x', pubDate: '2026-09-02 09:00:00' }, FEED, NOW) === null,
);
check(
  'missing title → dropped',
  toIngestedItem({ link: 'https://decrypt.co/x', pubDate: '2026-09-02 09:00:00' }, FEED, NOW) ===
    null,
);
check(
  'missing pubDate → dropped',
  toIngestedItem({ title: 'x', link: 'https://decrypt.co/x' }, FEED, NOW) === null,
);
check(
  'unparseable URL → dropped, not thrown',
  toIngestedItem({ title: 'x', link: 'not a url', pubDate: '2026-09-02 09:00:00' }, FEED, NOW) ===
    null,
);

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
