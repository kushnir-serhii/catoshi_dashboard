/**
 * Near-duplicate news clustering (spec 027 technical 5.3). Pure: no DB, no
 * clock. Two outlets covering the same event produce differently-worded
 * headlines; this groups them by normalised-title overlap coefficient plus at
 * least two shared named entities, so the read path can show one card per event.
 */

import {
  NEWS_CLUSTER_AMOUNT_MAX_RATIO,
  NEWS_CLUSTER_DOWN_WORDS,
  NEWS_CLUSTER_ENTITY_ALIASES,
  NEWS_CLUSTER_MIN_SHARED_ENTITIES,
  NEWS_CLUSTER_OVERLAP_MIN,
  NEWS_CLUSTER_SERIES_PREFIX_MAX_WORDS,
  NEWS_CLUSTER_STOP_WORDS,
  NEWS_CLUSTER_UP_WORDS,
  NEWS_CLUSTER_WINDOW_HOURS,
} from '@/consts/news';

const STOP_WORDS: ReadonlySet<string> = new Set(NEWS_CLUSTER_STOP_WORDS);

/** "$100M", "$1 billion", "$83,000", "$85.5k". Group 1 number, group 2 magnitude. */
const DOLLAR_RE =
  /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|b|bn|t|thousand|million|billion|trillion)?\b/gi;
/** "5%", "2.5 %". */
const PERCENT_RE = /(\d+(?:\.\d+)?)\s?%/g;
const MAGNITUDE: Readonly<Record<string, number>> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};

/** Alias map split into multi-word phrases (applied to text) and single tokens. */
const PHRASE_ALIASES: readonly [RegExp, string][] = Object.entries(NEWS_CLUSTER_ENTITY_ALIASES)
  .filter(([from]) => from.includes(' '))
  .map(([from, to]) => [new RegExp(`\\b${from.replace(/\s+/g, '\\s+')}\\b`, 'gi'), to]);
const TOKEN_ALIASES: ReadonlyMap<string, string> = new Map(
  Object.entries(NEWS_CLUSTER_ENTITY_ALIASES).filter(([from]) => !from.includes(' ')),
);
/** Canonical names reachable through the alias map: entities whatever their case. */
const ALIAS_TARGETS: ReadonlySet<string> = new Set(Object.values(NEWS_CLUSTER_ENTITY_ALIASES));

/** An already-stored item that a new item may join. */
export interface ClusterCandidate {
  id: number;
  clusterId: number;
  title: string;
  publishedAt: Date;
}

interface Token {
  /** Canonical lowercase form (alias map applied). */
  token: string;
  /** Capitalised or all-caps in the original-case title. */
  capitalised: boolean;
}

/**
 * Removes a leading series label ("Live updates:", "Morning Minute:") so a
 * recurring header is not mistaken for shared content. Only when the text before
 * the FIRST colon is at most `NEWS_CLUSTER_SERIES_PREFIX_MAX_WORDS` words; a
 * longer pre-colon segment is content and is kept. For comparison only - the
 * stored and displayed title is never changed.
 */
export function stripSeriesPrefix(title: string): string {
  const colon = title.indexOf(':');
  if (colon <= 0) return title;
  const prefixWords = title.slice(0, colon).trim().split(/\s+/).filter(Boolean).length;
  const rest = title.slice(colon + 1).trim();
  if (prefixWords === 0 || prefixWords > NEWS_CLUSTER_SERIES_PREFIX_MAX_WORDS || rest === '') {
    return title;
  }
  return rest;
}

/** Drops possessive 's ("SEC's" -> "SEC"); joins intra-word periods ("J.P." -> "JP"). */
function joinInnerPunctuation(title: string): string {
  return title.replace(/['’]s\b/gi, '').replace(/[.'’‘`]/g, '');
}

/**
 * Stop-word-free words of the title in canonical lowercase, each flagged with
 * whether it was capitalised in the ORIGINAL title (normalisation discards case,
 * so this is the only place it can be read).
 */
function tokens(title: string): Token[] {
  let text = joinInnerPunctuation(stripSeriesPrefix(title));
  for (const [re, to] of PHRASE_ALIASES) text = text.replace(re, to);
  const out: Token[] = [];
  for (const w of text.split(/[^\p{L}\p{N}]+/u)) {
    if (w.length === 0) continue;
    const lower = w.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    out.push({
      token: TOKEN_ALIASES.get(lower) ?? lower,
      capitalised: /^\p{Lu}/u.test(w),
    });
  }
  return out;
}

/**
 * Normalised title as a token set: lowercase, punctuation and stop-words
 * stripped, aliases canonicalised.
 */
export function normalizeTitle(title: string): Set<string> {
  return new Set(tokens(title).map((t) => t.token));
}

/** |A∩B| / min(|A|,|B|): robust to one outlet's headline being longer. */
export function overlapCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / smaller;
}

/** Canonical tokens that are capitalised in this title (outlets differ in casing). */
function capitalisedTokens(title: string): Set<string> {
  return new Set(
    tokens(title)
      .filter((t) => t.capitalised)
      .map((t) => t.token),
  );
}

/**
 * Named entities two titles share. A canonical token counts when it appears in
 * both titles AND is an entity: capitalised in EITHER headline (coindesk writes
 * "bitcoin" where decrypt writes "Bitcoin"), or an alias-map canonical name
 * (whatever its case).
 */
export function sharedEntities(a: string, b: string): string[] {
  const capA = capitalisedTokens(a);
  const capB = capitalisedTokens(b);
  const inB = normalizeTitle(b);
  return [...normalizeTitle(a)].filter(
    (t) => inB.has(t) && (capA.has(t) || capB.has(t) || ALIAS_TARGETS.has(t)),
  );
}

export function sharedEntityCount(a: string, b: string): number {
  return sharedEntities(a, b).length;
}

/** Overlap coefficient of two raw titles (after normalisation). Exposed for measurement. */
export function titleSimilarity(a: string, b: string): number {
  return overlapCoefficient(normalizeTitle(a), normalizeTitle(b));
}

/** Lowercase words of the title, single-space joined and padded for phrase lookup. */
function lowerWordText(title: string): string {
  return ` ${title
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .join(' ')} `;
}

/** Earliest position of any list entry (word or phrase) in padded text, or -1. */
function firstIndex(text: string, list: readonly string[]): number {
  let first = -1;
  for (const w of list) {
    const i = text.indexOf(` ${w} `);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  return first;
}

/** Side of the title's FIRST direction word or phrase, scanning left to right. */
function firstDirection(title: string): 'down' | 'up' | null {
  const text = lowerWordText(title);
  const down = firstIndex(text, NEWS_CLUSTER_DOWN_WORDS);
  const up = firstIndex(text, NEWS_CLUSTER_UP_WORDS);
  if (down === -1 && up === -1) return null;
  if (up === -1 || (down !== -1 && down < up)) return 'down';
  return 'up';
}

/**
 * True when the FIRST direction word of one title is a down word or phrase
 * (drop/fall/slip/dip/"breaks below"...) and the first of the other an up word
 * (rebound/rise/jump/climb/gain...): opposite moves are different events. Later
 * clauses ("... as oil jumps") are ignored; a phrase counts where it starts.
 */
export function directionConflict(a: string, b: string): boolean {
  const da = firstDirection(a);
  const db = firstDirection(b);
  return da !== null && db !== null && da !== db;
}

function parseAmounts(title: string, re: RegExp): number[] {
  const out: number[] = [];
  for (const m of title.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ''));
    const mult = m[2] === undefined ? 1 : MAGNITUDE[m[2].toLowerCase()];
    if (Number.isFinite(n) && n > 0) out.push(n * mult);
  }
  return out;
}

/** Dollar amounts in a title as plain numbers ("$1B" -> 1e9, "$83,000" -> 83000). */
export function dollarAmounts(title: string): number[] {
  return parseAmounts(title, DOLLAR_RE);
}

/** Percentages in a title as plain numbers ("5%" -> 5). */
export function percentAmounts(title: string): number[] {
  return parseAmounts(title, PERCENT_RE);
}

/** No amount in `a` is within `maxRatio`x of any amount in `b` (both non-empty). */
function allApart(a: readonly number[], b: readonly number[], maxRatio: number): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return a.every((x) => b.every((y) => Math.max(x, y) / Math.min(x, y) > maxRatio));
}

/**
 * True when both titles carry a dollar amount (or both a percentage) and the
 * amounts differ by more than `NEWS_CLUSTER_AMOUNT_MAX_RATIO`: a $100M move and
 * a $1B move are different events. $ compares with $, % with %.
 */
export function amountMismatch(
  a: string,
  b: string,
  maxRatio: number = NEWS_CLUSTER_AMOUNT_MAX_RATIO,
): boolean {
  return (
    allApart(dollarAmounts(a), dollarAmounts(b), maxRatio) ||
    allApart(percentAmounts(a), percentAmounts(b), maxRatio)
  );
}

/**
 * The `cluster_id` for a new item, or `null` when it starts its own cluster
 * (the caller then uses the item's own id). Candidates outside the window
 * around `publishedAt` are ignored, as are candidates that fail the direction
 * or amount guard; among qualifying candidates the most
 * similar wins (earliest-published on a tie).
 */
export function findClusterId(
  title: string,
  publishedAt: Date,
  candidates: readonly ClusterCandidate[],
  threshold: number = NEWS_CLUSTER_OVERLAP_MIN,
  minSharedEntities: number = NEWS_CLUSTER_MIN_SHARED_ENTITIES,
  windowHours: number = NEWS_CLUSTER_WINDOW_HOURS,
): number | null {
  const windowMs = windowHours * 3_600_000;
  const titleTokens = normalizeTitle(title);
  let best: { clusterId: number; score: number; at: number } | null = null;

  for (const c of candidates) {
    const at = c.publishedAt.getTime();
    if (Math.abs(publishedAt.getTime() - at) > windowMs) continue;
    const score = overlapCoefficient(titleTokens, normalizeTitle(c.title));
    if (score < threshold || sharedEntityCount(title, c.title) < minSharedEntities) continue;
    if (directionConflict(title, c.title) || amountMismatch(title, c.title)) continue;
    if (best === null || score > best.score || (score === best.score && at < best.at)) {
      best = { clusterId: c.clusterId, score, at };
    }
  }
  return best === null ? null : best.clusterId;
}
