/**
 * Tests for duplicate-news clustering (spec 027 technical 5.3).
 *
 * Run:  npx tsx src/scripts/news-cluster.test.ts
 *
 * Fixtures: the SEC 3x, OKX/ICE and Solana/JPMorgan pairs, the two "Live
 * updates:" posts and the two Metaplanet items are REAL headlines read from
 * `news_items` (2026-10-04..06; ids in comments). The Citi pair is SYNTHETIC:
 * no Citi duplicate exists in the stored items.
 *
 * Rule under test: overlap coefficient |A∩B|/min(|A|,|B|) >= 0.35 AND >= 2
 * shared named entities (case-blind, alias-aware), within 24h, after a short
 * series prefix ("Live updates:") is stripped.
 */

import { NEWS_CLUSTER_OVERLAP_MIN } from '@/consts/news';
import {
  amountMismatch,
  type ClusterCandidate,
  directionConflict,
  dollarAmounts,
  findClusterId,
  normalizeTitle,
  percentAmounts,
  sharedEntities,
  stripSeriesPrefix,
  titleSimilarity,
} from '@/lib/news/cluster';

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const H = 3_600_000;
const T0 = new Date('2026-10-05T12:00:00Z');
const at = (hoursAfter: number): Date => new Date(T0.getTime() + hoursAfter * H);

interface Pair {
  name: string;
  a: string; // earlier
  b: string; // later
  measured: string; // overlap coefficient to 3 dp
}

const REAL_PAIRS: Pair[] = [
  {
    name: 'SEC 3x funds', // coindesk 21851 / decrypt 22140
    a: 'SEC approves a 3x fix for bitcoin and ether traders who miss the wild swings',
    b: 'SEC Clears 3x Leveraged Bitcoin and Ethereum Funds for Trading',
    measured: '0.500',
  },
  {
    name: 'OKX/ICE', // coindesk 21650 / decrypt 21842
    a: 'Joint venture of OKX and NYSE parent ICE files for 24/7 tokenized U.S. stock trading',
    b: 'OKX and NYSE Owner ICE Plan 24/7 Tokenized Stock Trading Under SEC Exemption',
    measured: '0.615',
  },
  {
    name: 'Solana/JPMorgan', // decrypt 22461 / coindesk 22571
    a: 'Solana Debuts Institutional Settlement Standard With J.P. Morgan Input',
    b: 'Solana Foundation unveils a program to settle institutional trades in seconds. JPMorgan gave input',
    measured: '0.571',
  },
];

const CITI: Pair = {
  name: 'Citi (synthetic)',
  a: 'Citi and Broadridge launch tokenized deposit service for institutional clients',
  b: 'Citi, Broadridge roll out tokenized deposit service for institutional clients',
  measured: '0.875',
};

// Real different-event pairs that pass the 2-entity rule (must not cluster).
const LIVE_A = 'Live updates: Bitcoin above $86,000 as traders price out an October Fed hike'; // 21824
const LIVE_B = 'Live updates: A drop below $84,000 could put $80,000 in play for bitcoin'; // 22936
const META_A =
  'Metaplanet added 1,000 bitcoin net in the third quarter bringing holdings to 44,000 BTC'; // 21822
const META_B = 'Metaplanet Sold 10,000 Bitcoin and Bought Back 11,000 to Prove a Point'; // 21873

const cand = (title: string, hours = 0, id = 1, clusterId = id): ClusterCandidate[] => [
  { id, clusterId, title, publishedAt: at(hours) },
];

section('normalisation and aliases');
{
  const n = normalizeTitle("The SEC's 3x-Funds: Here's what BTC holders get!");
  check('stop-words and possessive stripped', !n.has('the') && !n.has('secs'));
  check('btc folds to bitcoin', n.has('bitcoin') && !n.has('btc'));
  check('J.P. Morgan = JPMorgan', normalizeTitle('J.P. Morgan').has('jpmorgan'));
  check('JPMorgan stays jpmorgan', normalizeTitle('JPMorgan').has('jpmorgan'));
}

section('alias / case-blind entities');
{
  const shared = sharedEntities(
    'SEC approves 3x fund for bitcoin and ether traders',
    'SEC Clears Bitcoin and Ethereum Funds',
  );
  check('bitcoin/Bitcoin counts', shared.includes('bitcoin'), shared.join(','));
  check('ether/Ethereum counts', shared.includes('ethereum'), shared.join(','));
  check(
    'J.P. Morgan / JPMorgan counts',
    sharedEntities('Solana adds J.P. Morgan input', 'Solana, JPMorgan weigh in').includes(
      'jpmorgan',
    ),
  );
  check(
    'lowercase in both, not aliased: not an entity',
    !sharedEntities('stock trading rises', 'stock trading falls').includes('trading'),
  );
}

section('series prefix');
{
  check(
    '<=4 words stripped (Live updates:)',
    stripSeriesPrefix('Live updates: Bitcoin rises') === 'Bitcoin rises',
  );
  check(
    '<=4 words stripped (Morning Minute:)',
    stripSeriesPrefix('Morning Minute: The CFTC Reveals Plan') === 'The CFTC Reveals Plan',
  );
  check(
    'exactly 4 words stripped',
    stripSeriesPrefix('One two three four: rest of it') === 'rest of it',
  );
  const golden = "Bitcoin Just Flashed a Second, Stronger Golden Cross: Here's What That Means";
  check('>=5 words kept (Golden Cross)', stripSeriesPrefix(golden) === golden);
  check(
    '5 words kept',
    stripSeriesPrefix('One two three four five: rest') === 'One two three four five: rest',
  );
  check('no colon unchanged', stripSeriesPrefix('Bitcoin rises today') === 'Bitcoin rises today');
  check('nothing after colon unchanged', stripSeriesPrefix('Live updates:') === 'Live updates:');
  check('only the first colon is used', stripSeriesPrefix('Live: a: b') === 'a: b');
  check(
    'prefix is not part of tokens',
    !normalizeTitle('Morning Minute: Uptober green').has('morning'),
  );
}

section('measured overlap of the duplicate pairs');
for (const p of [...REAL_PAIRS, CITI]) {
  const s = titleSimilarity(p.a, p.b);
  console.log(`  ${p.name}: ${s.toFixed(3)}`);
  check(`${p.name} measured`, s.toFixed(3) === p.measured, `got ${s.toFixed(3)}`);
}

section('default threshold');
check('default is 0.35', NEWS_CLUSTER_OVERLAP_MIN === 0.35);
for (const p of [...REAL_PAIRS, CITI]) {
  check(`${p.name}: clusters at default`, findClusterId(p.b, at(2), cand(p.a, 0, 7, 5)) === 5);
}

section('real different-event pairs must not cluster');
{
  check('Live updates x2 do not cluster', findClusterId(LIVE_B, at(1), cand(LIVE_A)) === null);
  check(
    'Live updates: only bitcoin is shared',
    sharedEntities(LIVE_A, LIVE_B).join(',') === 'bitcoin',
    sharedEntities(LIVE_A, LIVE_B).join(','),
  );
  check(
    'Metaplanet buy vs sell do not cluster',
    findClusterId(META_B, at(1), cand(META_A)) === null,
  );
  check(
    'Metaplanet score stays below threshold',
    titleSimilarity(META_A, META_B) < NEWS_CLUSTER_OVERLAP_MIN,
  );
}

section('negatives');
{
  const c = cand('Bitcoin dips below $84,000 as oil jumps on Iranian tanker attacks');
  check(
    'same ticker, different event: no cluster',
    findClusterId('Bitcoin ETF inflows hit a record as BlackRock leads', at(1), c) === null,
  );
}
{
  check('inside 24h clusters', findClusterId(CITI.b, at(23), cand(CITI.a)) === 1);
  check('just over 24h apart: no cluster', findClusterId(CITI.b, at(25), cand(CITI.a)) === null);
  check(
    'window is symmetric (candidate newer)',
    findClusterId(CITI.b, at(-25), cand(CITI.a)) === null,
  );
}
{
  const t = 'bitcoin etf inflows hit a record as institutions pile in';
  check(
    'identical words but no named entity: no cluster',
    findClusterId(t + ' again', at(1), cand(t)) === null,
  );
}

section('guards: parsing');
{
  check('$100M', dollarAmounts('moves $100M in BTC').join() === '100000000');
  check('$1B', dollarAmounts('moves $1B').join() === '1000000000');
  check('$1 billion', dollarAmounts('moves $1 billion in bitcoin').join() === '1000000000');
  check('$103 Million', dollarAmounts('Moves $103 Million in').join() === '103000000');
  check('$83,000', dollarAmounts('below $83,000 as').join() === '83000');
  check('$85.5k', dollarAmounts('pop to $85.5k').join() === '85500');
  check('5%', percentAmounts('ETH up 5% today').join() === '5');
  check('no amount', dollarAmounts('Bitcoin rises').length === 0);
}

section('guards: direction and amount');
{
  check('down vs up conflicts', directionConflict('Bitcoin falls on X', 'Bitcoin rallies on X'));
  check('up vs down conflicts', directionConflict('BTC surges', 'BTC plunged'));
  check('down vs down is fine', !directionConflict('Bitcoin drops', 'Bitcoin fell'));
  check(
    'only the first direction word counts',
    !directionConflict('Bitcoin dips as oil jumps', 'Bitcoin dips on oil shock'),
  );
  check(
    'phrase counts where it starts',
    directionConflict('Bitcoin breaks below $83K as oil jumps', 'Bitcoin rebounds'),
  );
  check('no direction words is fine', !directionConflict('SEC approves', 'SEC clears'));
  check('$ 10x apart mismatches', amountMismatch('moves $100M', 'moves $1B'));
  check('$ within 2x is fine', !amountMismatch('$100 million', '$103 Million'));
  check('% 3x apart mismatches', amountMismatch('up 5%', 'up 15%'));
  check('$ vs % never compared', !amountMismatch('moves $100M', 'up 5%'));
  check('amount in only one title is fine', !amountMismatch('moves $1B', 'moves funds'));
}

// Flagged false merges from the 2026-10-09 cluster_id backfill (real titles,
// ids in comments).
const GOV_100M =
  "U.S. government moves over $100 million in BTC and BNB. A sale hasn't been confirmed"; // 24191
const GOV_1B = 'US Government Moves $1 Billion in Bitcoin Seized From Bitfinex Hacker'; // 26492
const GOV_103M = "US Government Moves $103 Million in Seized Bitcoin and BNB, But Hasn't Said Why"; // 24892
const GOV_1B_A =
  'U.S. government moves $1 billion in bitcoin from Bitfinex hack wallet, no sale indicated'; // 26410
const IRAN_DROP = 'Bitcoin breaks below $83,000 as oil jumps on Iran strike-plan report'; // 25583
const IRAN_REBOUND = 'Bitcoin rebounds to $82,000 as Trump rules out Iran strikes, oil drops'; // 27230
const BUNKER_A =
  "Bitcoin slips below $83,000 as Ethereum researcher's 'bunker mode' call divides crypto"; // 26072
const BUNKER_B =
  'Bitcoin and ether holders urged to enter ‘bunker mode’ against possible AI attacks'; // 26127
const PCE_LIVE = 'Live updates: Bitcoin below $84,000 ahead of PCE inflation data, Micron earnings'; // 15421
const PCE_JUMP = 'Bitcoin Jumps on Cool PCE Inflation Data as Bond Yields Hit 20-Year Highs'; // 15759
const PCE_FADE = "Bitcoin's soft-inflation pop to $85,500 fades as bond yields refuse to fall"; // 16591
const OIL_DIP_A = 'Bitcoin dips below $84,000 as oil jumps on Iranian tanker attacks'; // 23967
const OIL_DIP_B = 'Bitcoin Dips Below $83K as Oil Shock Rattles Markets: What Happens Next?'; // 24836
section('flagged backfill merges must not cluster');
{
  check(
    '24191: $100M move vs $1B Bitfinex move',
    findClusterId(GOV_1B, at(1), cand(GOV_100M)) === null,
  );
  check('24191: blocked by amount guard', amountMismatch(GOV_100M, GOV_1B));
  check(
    '25583: breaks below vs rebounds',
    findClusterId(IRAN_REBOUND, at(1), cand(IRAN_DROP)) === null,
  );
  check('25583: blocked by direction guard', directionConflict(IRAN_DROP, IRAN_REBOUND));
  // 15421 cluster: 16591 joined through 15759 (overlap 0.364); "Jumps" vs
  // "fall" now blocks that link. 15421 vs 16591 never matched directly (0.200).
  check(
    '15759 vs 16591: post-PCE jump vs pop/fade',
    findClusterId(PCE_FADE, at(1), cand(PCE_JUMP)) === null,
  );
  check('15759 vs 16591: blocked by direction guard', directionConflict(PCE_JUMP, PCE_FADE));
  check(
    '15421 vs 16591: live update vs post-PCE pop/fade',
    findClusterId(PCE_FADE, at(1), cand(PCE_LIVE)) === null,
  );
  // STILL NOT BLOCKED - reported to the operator, not asserted:
  // 15421 (PCE_LIVE) vs 15759 (PCE_JUMP), overlap 0.400, 4 shared entities.
  // The live title says only "below" (no listed down word) and 15759 has no
  // amount, so neither guard fires.
}

section('accepted merges');
{
  // 23967 / 24836: same oil-shock dip from two outlets. The first direction
  // word is "dips" in both; the later "as oil jumps" is ignored.
  check(
    '23967/24836: oil-shock dip pair clusters',
    findClusterId(OIL_DIP_B, at(1), cand(OIL_DIP_A, 0, 7, 5)) === 5,
  );
  // 26072 / 26127: ACCEPTED merge (operator 2026-10-09) - both are the same
  // "bunker mode" story; "slips" in one title has no up word opposite it.
  check(
    '26072: bunker mode pair clusters',
    findClusterId(BUNKER_B, at(1), cand(BUNKER_A, 0, 7, 5)) === 5,
  );
  check(
    '24191/24892: $100M and $103M move clusters',
    findClusterId(GOV_103M, at(1), cand(GOV_100M, 0, 7, 5)) === 5,
  );
  check(
    '26410/26492: $1B Bitfinex move clusters',
    findClusterId(GOV_1B, at(1), cand(GOV_1B_A, 0, 7, 5)) === 5,
  );
}

section('selection');
{
  const cands: ClusterCandidate[] = [
    { id: 1, clusterId: 1, title: 'Citi Broadridge earnings', publishedAt: at(0) },
    { id: 2, clusterId: 2, title: CITI.a, publishedAt: at(1) },
  ];
  check('most similar candidate wins', findClusterId(CITI.b, at(2), cands) === 2);
  check('no candidates: null (caller uses own id)', findClusterId(CITI.b, at(2), []) === null);
}

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
