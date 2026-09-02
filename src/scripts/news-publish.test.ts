/**
 * Publish tests for spec 015, Slice 5 (technical-considerations §4, "Unit").
 *
 * Run:  npx tsx src/scripts/news-publish.test.ts
 *
 * No real network, no real database. The expiry / severity / scope-filter /
 * liveness helpers are pure; `publishNews` is exercised through its injected
 * `publish` seam. Exits non-zero on failure (pattern: signal-rules.test.ts).
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

void (async () => {
  const { NEWS_MAGNITUDE_SEVERITY } = await import('@/consts/news');
  const { SEVERITY_FIXED_MID } = await import('@/consts/signals');
  const { formatSnapshotAge, snapshotAgeMinutes } = await import('@/lib/freshness');
  const {
    filterNewsByScope,
    isNewsLive,
    newestNewsPublishedAt,
    newsSignalExpiry,
    newsSignalSeverity,
  } = await import('@/lib/news/feed');
  const { publishNews } = await import('@/lib/news/publish');

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

  // -------------------------------------------------------------------------
  section('newsSignalExpiry — published_at + horizon_hours, absolute duration');
  // -------------------------------------------------------------------------

  {
    const published = '2026-09-02T12:00:00.000Z';
    const exp = newsSignalExpiry(published, 168);
    check(
      'UTC: 168h after noon 2026-09-02 is noon 2026-09-09',
      exp.toISOString() === '2026-09-09T12:00:00.000Z',
      exp.toISOString(),
    );
    check(
      'accepts a Date and a string identically',
      newsSignalExpiry(new Date(published), 24).getTime() ===
        newsSignalExpiry(published, 24).getTime(),
    );

    // US spring-forward 2026: 2026-03-08, clocks 02:00 EST -> 03:00 EDT.
    // An absolute-duration add must move the instant by exactly horizon hours,
    // regardless of the wall-clock hour the local zone skips.
    const beforeDst = '2026-03-08T04:00:00.000Z'; // 23:00 EST on 03-07
    const across = newsSignalExpiry(beforeDst, 6); // lands after the transition
    check(
      'DST boundary: instant moves exactly 6h (no skipped/doubled hour)',
      across.getTime() - new Date(beforeDst).getTime() === 6 * HOUR_MS,
    );
    check(
      'DST boundary: ISO is 6h later in UTC',
      across.toISOString() === '2026-03-08T10:00:00.000Z',
      across.toISOString(),
    );
  }

  // -------------------------------------------------------------------------
  section('Ageing derives from published_at, not classification time');
  // -------------------------------------------------------------------------

  {
    // Article published a week ago, only just classified/published now.
    const now = new Date('2026-09-09T12:00:00.000Z');
    const publishedAWeekAgo = '2026-09-02T12:00:00.000Z';
    const classifiedJustNow = '2026-09-09T11:59:00.000Z';

    const ageFromPublished = snapshotAgeMinutes(publishedAWeekAgo, now);
    check(
      'age from published_at is ~1 week (10080 min), not ~0',
      ageFromPublished === 7 * 24 * 60,
      String(ageFromPublished),
    );
    check(
      'formatted age reads "7d ago"',
      formatSnapshotAge(publishedAWeekAgo, now) === '7d ago',
      String(formatSnapshotAge(publishedAWeekAgo, now)),
    );
    // Sanity: if ageing wrongly used classified_at it would read ~0.
    check(
      'age from classified_at would be ~1m — the defect this guards against',
      snapshotAgeMinutes(classifiedJustNow, now) === 1,
    );
  }

  // -------------------------------------------------------------------------
  section('Magnitude -> severity, and cross-kind ordering');
  // -------------------------------------------------------------------------

  {
    check('LOW maps to the map value', newsSignalSeverity('LOW') === NEWS_MAGNITUDE_SEVERITY.LOW);
    check(
      'MEDIUM maps to the map value',
      newsSignalSeverity('MEDIUM') === NEWS_MAGNITUDE_SEVERITY.MEDIUM,
    );
    check(
      'HIGH maps to the map value',
      newsSignalSeverity('HIGH') === NEWS_MAGNITUDE_SEVERITY.HIGH,
    );
    check(
      'ordering LOW < MEDIUM < HIGH',
      newsSignalSeverity('LOW') < newsSignalSeverity('MEDIUM') &&
        newsSignalSeverity('MEDIUM') < newsSignalSeverity('HIGH'),
    );
    check(
      'a HIGH news item outranks a no-natural-scale market-state rule (0.5)',
      newsSignalSeverity('HIGH') > SEVERITY_FIXED_MID,
    );
    check(
      'a LOW news item sinks below any active market-state signal (0.5)',
      newsSignalSeverity('LOW') < SEVERITY_FIXED_MID,
    );
  }

  // -------------------------------------------------------------------------
  section('Scope filter (pure)');
  // -------------------------------------------------------------------------

  {
    const mk = (id: string, scope: 'market' | 'BTC' | 'ETH' | 'SOL') =>
      ({ id, scope }) as { id: string; scope: 'market' | 'BTC' | 'ETH' | 'SOL' };
    const items = [mk('a', 'market'), mk('b', 'ETH'), mk('c', 'BTC'), mk('d', 'ETH')];

    check('all → unchanged', filterNewsByScope(items, 'all').length === 4);
    const eth = filterNewsByScope(items, 'ETH');
    check('scope=ETH → only ETH news', eth.length === 2 && eth.every((i) => i.scope === 'ETH'));
    check('scope=ETH → excludes market news', !eth.some((i) => i.scope === 'market'));
    const market = filterNewsByScope(items, 'market');
    check(
      'scope=market → only market news, no per-asset',
      market.length === 1 && market[0].scope === 'market',
    );
  }

  // -------------------------------------------------------------------------
  section('Expired-exclusion logic (pure)');
  // -------------------------------------------------------------------------

  {
    const now = new Date('2026-09-09T12:00:00.000Z');
    check('expires in the future → live', isNewsLive('2026-09-09T13:00:00.000Z', now));
    check('expires exactly now → not live', !isNewsLive('2026-09-09T12:00:00.000Z', now));
    check('expired an hour ago → not live', !isNewsLive('2026-09-09T11:00:00.000Z', now));
    check('unparseable expiry → not live', !isNewsLive('not-a-date', now));
  }

  // -------------------------------------------------------------------------
  section('newestNewsPublishedAt');
  // -------------------------------------------------------------------------

  {
    const items = [
      { publishedAt: '2026-09-01T00:00:00.000Z' },
      { publishedAt: '2026-09-05T00:00:00.000Z' },
      { publishedAt: '2026-09-03T00:00:00.000Z' },
    ];
    check('picks the latest', newestNewsPublishedAt(items) === '2026-09-05T00:00:00.000Z');
    check('empty → null', newestNewsPublishedAt([]) === null);
  }

  // -------------------------------------------------------------------------
  section('publishNews orchestration (injected seam)');
  // -------------------------------------------------------------------------

  {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
    const ok = await publishNews({ publish: async () => ({ published: 3 }) });
    check(
      'success → ok:true',
      ok.sources[0]?.ok === true && ok.sources[0]?.source === 'news:publish',
    );
    check('success → passes the inserted count through', ok.published === 3);

    let threw = false;
    let failResult;
    try {
      failResult = await publishNews({
        publish: async () => {
          throw new Error('unique_violation');
        },
      });
    } catch {
      threw = true;
    }
    check('a DB failure does not throw', threw === false);
    check('a DB failure → ok:false in source status', failResult?.sources[0]?.ok === false);
    check('a DB failure → published 0', failResult?.published === 0);

    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true';
    let seamCalled = false;
    const mock = await publishNews({
      publish: async () => {
        seamCalled = true;
        return { published: 9 };
      },
    });
    check('mock mode → seam not called', seamCalled === false);
    check('mock mode → ok:true, published 0', mock.sources[0]?.ok === true && mock.published === 0);
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
  }

  // -------------------------------------------------------------------------

  console.log(
    failures === 0
      ? `\nAll ${checks} checks passed.\n`
      : `\n${failures} of ${checks} checks FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
