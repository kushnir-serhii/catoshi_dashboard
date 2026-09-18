/**
 * Tests for the Signals-page empty-state copy (spec 023, Slice 4).
 *
 * Run:  npx tsx src/scripts/empty-state-copy.test.ts
 *
 * The regression this guards: `SignalsPage` used to render a hard-coded
 * "Collection is healthy and up to date" empty state directly below a banner
 * that says collection may be stalled — the page contradicting itself on the
 * same screen (`decisions.md` §3). These functions are pure, so the fix is
 * verified without a DOM: the stale branch must never contain the words
 * "healthy" or "up to date", and the fresh branch is unchanged.
 */

import { marketEmptyStateCopy } from '@/lib/freshness';
import { newsEmptyStateCopy } from '@/lib/news/feed';

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

function claimsHealth(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('healthy') || lower.includes('up to date');
}

const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const FRESH_TS = '2026-09-18T11:50:00.000Z'; // 10 minutes old
const STALE_TS = '2026-09-16T12:00:00.000Z'; // 2 days old

// ---------------------------------------------------------------------------
section('marketEmptyStateCopy — fresh collection');
// ---------------------------------------------------------------------------

{
  const copy = marketEmptyStateCopy(false, FRESH_TS, NOW);
  check('fresh copy claims health', claimsHealth(copy.body));
  check('fresh title is stable', copy.title === 'No signals right now');
}

// ---------------------------------------------------------------------------
section('marketEmptyStateCopy — stale collection');
// ---------------------------------------------------------------------------

{
  const copy = marketEmptyStateCopy(true, STALE_TS, NOW);
  check('stale copy never claims "healthy" or "up to date"', !claimsHealth(copy.body), copy.body);
  check('stale copy states an age', copy.body.includes('2d ago'), copy.body);
  check('stale copy says signals cannot be current', copy.body.toLowerCase().includes('stalled'));
}

{
  // No timestamp at all still must not claim health.
  const copy = marketEmptyStateCopy(true, null, NOW);
  check('stale copy with no timestamp still avoids the health claim', !claimsHealth(copy.body));
  check(
    'stale copy with no timestamp falls back to "a while ago"',
    copy.body.includes('a while ago'),
  );
}

// ---------------------------------------------------------------------------
section('newsEmptyStateCopy — fresh collection');
// ---------------------------------------------------------------------------

{
  const quietBody = 'No classified headline is currently within its impact horizon.';
  const copy = newsEmptyStateCopy(false, quietBody);
  check('fresh news copy passes through the quiet body unchanged', copy.body === quietBody);
  check('fresh news copy does not claim health', !claimsHealth(copy.body));
}

// ---------------------------------------------------------------------------
section('newsEmptyStateCopy — stale collection');
// ---------------------------------------------------------------------------

{
  const quietBody = 'No classified headline is currently within its impact horizon.';
  const copy = newsEmptyStateCopy(true, quietBody);
  check('stale news copy overrides the quiet body', copy.body !== quietBody);
  check(
    'stale news copy never claims "healthy" or "up to date"',
    !claimsHealth(copy.body),
    copy.body,
  );
  check(
    'stale news copy says signals may not be current',
    copy.body.toLowerCase().includes('stalled'),
  );
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
