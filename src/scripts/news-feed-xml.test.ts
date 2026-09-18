/**
 * Tests for the direct RSS/Atom XML parsing that replaced the rss2json bridge
 * (spec 023, Slice 5).
 *
 * Run:  npx tsx src/scripts/news-feed-xml.test.ts
 *
 * No network — `parseFeedXml` and `parsePubDate` are pure, so fixtures and
 * assertions are enough. Covers: RSS 2.0 `<item>`, Atom `<entry>`, RFC-822 and
 * ISO-8601 dates, CDATA + entity-escaped titles, and that malformed XML
 * yields zero items (the caller in `newsFeed.ts` treats that as a failed
 * fetch, never a silent empty success, and never lets it affect other feeds).
 */

import { parseFeedXml, parsePubDate } from '@/lib/collectors/newsFeed';

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

// ---------------------------------------------------------------------------
section('parsePubDate — RFC-822 and ISO-8601, no now() fallback');
// ---------------------------------------------------------------------------

{
  const rfc822 = parsePubDate('Mon, 01 Sep 2026 13:45:00 +0000');
  check(
    'RFC-822 parses to the right instant',
    rfc822?.toISOString() === '2026-09-01T13:45:00.000Z',
    rfc822?.toISOString(),
  );

  const iso = parsePubDate('2026-09-01T13:45:00Z');
  check('ISO-8601 parses to the right instant', iso?.toISOString() === '2026-09-01T13:45:00.000Z');

  const isoOffset = parsePubDate('2026-09-01T15:45:00+02:00');
  check(
    'ISO-8601 with a numeric offset normalises to UTC',
    isoOffset?.toISOString() === '2026-09-01T13:45:00.000Z',
  );

  check('empty string is unparsable', parsePubDate('') === null);
  check('garbage is unparsable, not clamped to now', parsePubDate('not a date') === null);
}

// ---------------------------------------------------------------------------
section('parseFeedXml — RSS 2.0 <item>');
// ---------------------------------------------------------------------------

{
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>BTC ETF sees record inflows</title>
      <link>https://example.com/btc-etf?utm_source=rss</link>
      <pubDate>Mon, 01 Sep 2026 13:45:00 +0000</pubDate>
      <description>Some body text</description>
    </item>
    <item>
      <title><![CDATA[ETH &amp; SOL both rally]]></title>
      <link>https://example.com/eth-sol-rally</link>
      <pubDate>Tue, 02 Sep 2026 08:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

  const items = parseFeedXml(rss);
  check('parses both items', items.length === 2, `got ${items.length}`);
  check('first title is exact', items[0]?.title === 'BTC ETF sees record inflows');
  check(
    'first link is the plain-text RSS link',
    items[0]?.link === 'https://example.com/btc-etf?utm_source=rss',
  );
  check(
    'first pubDate is the raw RFC-822 string',
    items[0]?.pubDate === 'Mon, 01 Sep 2026 13:45:00 +0000',
  );
  check(
    'CDATA-wrapped title with an entity decodes correctly',
    items[1]?.title === 'ETH & SOL both rally',
    items[1]?.title,
  );
}

// ---------------------------------------------------------------------------
section('parseFeedXml — Atom <entry>');
// ---------------------------------------------------------------------------

{
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <entry>
    <title>SOL network upgrade ships</title>
    <link rel="self" href="https://example.com/feed/1"/>
    <link rel="alternate" type="text/html" href="https://example.com/articles/sol-upgrade"/>
    <published>2026-09-03T10:00:00Z</published>
    <updated>2026-09-03T11:00:00Z</updated>
  </entry>
</feed>`;

  const items = parseFeedXml(atom);
  check('parses one entry', items.length === 1, `got ${items.length}`);
  check('title is exact', items[0]?.title === 'SOL network upgrade ships');
  check(
    'link prefers rel="alternate" over rel="self"',
    items[0]?.link === 'https://example.com/articles/sol-upgrade',
    items[0]?.link,
  );
  check('pubDate falls back to <published>', items[0]?.pubDate === '2026-09-03T10:00:00Z');
}

// ---------------------------------------------------------------------------
section('parseFeedXml — malformed input contributes nothing');
// ---------------------------------------------------------------------------

{
  check('empty string yields no items', parseFeedXml('').length === 0);
  check(
    'plain HTML with no item/entry tags yields no items',
    parseFeedXml('<html><body>Not a feed</body></html>').length === 0,
  );
  check(
    'truncated/broken XML yields no items rather than throwing',
    parseFeedXml('<rss><channel><item><title>Unterminated').length === 0,
  );
}

// ---------------------------------------------------------------------------
section('parseFeedXml — Dublin Core dc:date');
// ---------------------------------------------------------------------------

{
  // RSS 1.0 / RDF carries no <pubDate> at all — only <dc:date>. Before this was
  // handled, every item of such a feed lost its date, toIngestedItem dropped all
  // of them, and the feed reported "no items parsed" — a parse error message for
  // what is really a well-formed feed.
  const rdf = `<rdf:RDF><item rdf:about="https://example.test/a">
    <title>RDF item carrying only dc:date</title>
    <link>https://example.test/a</link>
    <dc:date>2026-09-18T10:30:00Z</dc:date>
  </item></rdf:RDF>`;
  const rdfItems = parseFeedXml(rdf);
  check('dc:date-only item is parsed', rdfItems.length === 1, String(rdfItems.length));
  check(
    'dc:date supplies the publication date',
    parsePubDate(rdfItems[0]?.pubDate ?? '')?.toISOString() === '2026-09-18T10:30:00.000Z',
    rdfItems[0]?.pubDate,
  );

  // When both are present, the real publication date must win over dc:date.
  const both = `<rss><channel><item>
    <title>Both pubDate and dc:date</title>
    <link>https://example.test/b</link>
    <pubDate>Thu, 18 Sep 2026 09:00:00 +0000</pubDate>
    <dc:date>2026-01-01T00:00:00Z</dc:date>
  </item></channel></rss>`;
  const bothItems = parseFeedXml(both);
  check(
    'pubDate is preferred over dc:date when both are present',
    parsePubDate(bothItems[0]?.pubDate ?? '')?.toISOString() === '2026-09-18T09:00:00.000Z',
    bothItems[0]?.pubDate,
  );

  // `updated` is a revision time, so it must never outrank a publication date.
  const atom = `<feed><entry>
    <title>Atom entry with published and updated</title>
    <link rel="alternate" href="https://example.test/c"/>
    <published>2026-09-18T08:00:00Z</published>
    <updated>2026-09-18T20:00:00Z</updated>
  </entry></feed>`;
  const atomItems = parseFeedXml(atom);
  check(
    'published outranks updated',
    parsePubDate(atomItems[0]?.pubDate ?? '')?.toISOString() === '2026-09-18T08:00:00.000Z',
    atomItems[0]?.pubDate,
  );
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
