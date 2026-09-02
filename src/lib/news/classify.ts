/**
 * News impact classification (spec 015, Slice 4).
 *
 * One structured tool-use call per batch on the cheap tier, following
 * `src/lib/forecast/claude.ts` exactly — a single tool with a forced
 * `tool_choice`, results read from the `tool_use` block, never from free text.
 * No second provider layer: this reuses the `@anthropic-ai/sdk` client
 * directly, as the forecast provider does.
 *
 * Discipline (functional-spec 2.5):
 *   - On any failure (API error, malformed tool output, transaction error) this
 *     writes NOTHING — no neutral row, no placeholder, no re-dated previous
 *     answer — and records `{ source: 'news:classify', ok: false }`.
 *   - A malformed classification is a dropped row, never a coerced one.
 *   - Gated to run at most every `NEWS_CLASSIFY_INTERVAL_HOURS`, capped at
 *     `NEWS_CLASSIFY_MAX_PER_RUN` items per run; the remainder defers.
 *   - Mock mode: no API call, no-op returning an ok status.
 *
 * Pure helpers (`validateClassification`, `isCadenceElapsed`) are exported and
 * unit-tested without a database or network. `classifyNews` takes an optional
 * dependency bag so the orchestration is testable with a mocked Anthropic
 * client and in-memory DB seams.
 */

import Anthropic from '@anthropic-ai/sdk';

import { COLLECT_ASSETS } from '@/consts/collect';
import { computeModelCostUsd } from '@/consts/forecastPricing';
import {
  NEWS_CLASSIFY_BATCH_SIZE,
  NEWS_CLASSIFY_INTERVAL_HOURS,
  NEWS_CLASSIFY_MAX_PER_RUN,
  NEWS_CLASSIFY_MODEL,
  NEWS_HORIZON_HOURS_MAX,
  NEWS_HORIZON_HOURS_MIN,
  NEWS_PROMPT_VERSION,
} from '@/consts/news';
import type { SourceStatus } from '@/data/types';
import { query } from '@/lib/db/client';
import { type ClassificationInsert, persistClassifications } from '@/lib/db/news';

import { NEWS_CLASSIFY_SYSTEM_PROMPT } from './prompt';

const SOURCE = 'news:classify';
const HOUR_MS = 3_600_000;
const TOOL_NAME = 'classify_news';
const TRACKED_SYMBOLS: readonly string[] = COLLECT_ASSETS.map((a) => a.symbol);

const DIRECTIONS = new Set(['BULLISH', 'BEARISH', 'NEUTRAL']);
const MAGNITUDES = new Set(['LOW', 'MEDIUM', 'HIGH']);

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

const TOOL_INPUT_SCHEMA: Anthropic.Tool['input_schema'] = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      description: 'One entry per headline id supplied in the prompt.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The headline id from the prompt, verbatim' },
          scope: {
            type: 'string',
            description: "'market', one of BTC/ETH/SOL, or 'drop'",
          },
          direction: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
          magnitude: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          horizon_hours: {
            type: 'integer',
            description: `Integer in [${NEWS_HORIZON_HOURS_MIN}, ${NEWS_HORIZON_HOURS_MAX}]`,
          },
          confidence: { type: 'number', description: '0..1, how sure the classifier is' },
          rationale: {
            type: 'string',
            description: 'One sentence, referencing the specific content of the headline',
          },
        },
        required: [
          'id',
          'scope',
          'direction',
          'magnitude',
          'horizon_hours',
          'confidence',
          'rationale',
        ],
      },
    },
  },
  required: ['classifications'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single tool-use entry as received, before validation — all fields untrusted. */
export interface RawClassification {
  id?: unknown;
  scope?: unknown;
  direction?: unknown;
  magnitude?: unknown;
  horizon_hours?: unknown;
  confidence?: unknown;
  rationale?: unknown;
}

export interface ValidClassification {
  /** `'market'` or a tracked symbol. */
  scope: string;
  /** The tracked symbol for an asset scope; `null` for `'market'`. */
  assetSymbol: string | null;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  magnitude: 'LOW' | 'MEDIUM' | 'HIGH';
  horizonHours: number;
  confidence: number;
  rationale: string;
}

export type ValidationResult =
  | { ok: true; value: ValidClassification }
  | { ok: false; reason: string };

export interface PendingNewsItem {
  id: number;
  title: string;
  source: string;
  /** ISO 8601 `published_at`. */
  publishedAt: string;
}

export interface ClassifyNewsDeps {
  /** Injected "now" for the cadence gate (tests). Defaults to `new Date()`. */
  now?: Date;
  /** Injected Anthropic client (tests). Defaults to a real SDK client. */
  client?: Anthropic;
  /** Most recent `news_classifications.created_at`, or null if none. */
  loadLastRunAt?: () => Promise<Date | null>;
  /** Oldest-first unclassified items, up to `limit`. */
  loadPendingItems?: (limit: number) => Promise<PendingNewsItem[]>;
  /** symbol -> `assets.id` for the tracked symbols. */
  loadAssetIdMap?: () => Promise<Record<string, number>>;
  /** Transactional persist of one batch's rows + `classified_at` stamps. */
  persist?: (
    inserts: readonly ClassificationInsert[],
    terminalItemIds: readonly number[],
  ) => Promise<void>;
}

export interface ClassifyNewsResult {
  sources: SourceStatus[];
  /** Rows inserted into `news_classifications`. */
  classified: number;
  /** Items seen but not persisted (invalid, unresolvable, or omitted by the model). */
  dropped: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Validates one raw tool-use entry against the enums and bounds. Every
 * rejection is terminal: the caller drops the row, writing NOTHING to
 * `news_classifications`. Nothing here coerces — an out-of-enum direction is a
 * dropped row, not a `NEUTRAL` one.
 */
export function validateClassification(
  raw: RawClassification,
  trackedSymbols: readonly string[],
): ValidationResult {
  const scopeRaw = typeof raw.scope === 'string' ? raw.scope.trim() : '';
  if (!scopeRaw) return { ok: false, reason: 'missing scope' };

  let scope: string;
  let assetSymbol: string | null;
  if (scopeRaw.toLowerCase() === 'market') {
    scope = 'market';
    assetSymbol = null;
  } else {
    const symbol = scopeRaw.toUpperCase();
    if (!trackedSymbols.includes(symbol)) {
      return { ok: false, reason: `scope "${scopeRaw}" is not 'market' and not a tracked symbol` };
    }
    scope = symbol;
    assetSymbol = symbol;
  }

  const direction = typeof raw.direction === 'string' ? raw.direction.trim().toUpperCase() : '';
  if (!DIRECTIONS.has(direction)) {
    return {
      ok: false,
      reason: `direction "${String(raw.direction)}" not in BULLISH|BEARISH|NEUTRAL`,
    };
  }

  const magnitude = typeof raw.magnitude === 'string' ? raw.magnitude.trim().toUpperCase() : '';
  if (!MAGNITUDES.has(magnitude)) {
    return { ok: false, reason: `magnitude "${String(raw.magnitude)}" not in LOW|MEDIUM|HIGH` };
  }

  const horizonNum =
    typeof raw.horizon_hours === 'number' ? raw.horizon_hours : Number(raw.horizon_hours);
  if (!Number.isFinite(horizonNum)) {
    return { ok: false, reason: `horizon_hours "${String(raw.horizon_hours)}" is not a number` };
  }
  const horizonHours = Math.round(horizonNum);
  if (horizonHours < NEWS_HORIZON_HOURS_MIN || horizonHours > NEWS_HORIZON_HOURS_MAX) {
    return {
      ok: false,
      reason: `horizon_hours ${horizonHours} outside [${NEWS_HORIZON_HOURS_MIN}, ${NEWS_HORIZON_HOURS_MAX}]`,
    };
  }

  const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: `confidence "${String(raw.confidence)}" outside 0..1` };
  }

  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';
  if (!rationale) return { ok: false, reason: 'missing rationale' };

  return {
    ok: true,
    value: {
      scope,
      assetSymbol,
      direction: direction as ValidClassification['direction'],
      magnitude: magnitude as ValidClassification['magnitude'],
      horizonHours,
      confidence,
      rationale,
    },
  };
}

/**
 * The cadence gate: classification runs only if the last run is at least
 * `NEWS_CLASSIFY_INTERVAL_HOURS` old. No prior run (null) → run.
 */
export function isCadenceElapsed(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= NEWS_CLASSIFY_INTERVAL_HOURS * HOUR_MS;
}

// ---------------------------------------------------------------------------
// Default DB seams
// ---------------------------------------------------------------------------

async function defaultLoadLastRunAt(): Promise<Date | null> {
  const rows = await query<{ created_at: string | null }>(
    'select max(created_at) as created_at from public.news_classifications',
  );
  const value = rows[0]?.created_at ?? null;
  return value ? new Date(value) : null;
}

async function defaultLoadPendingItems(limit: number): Promise<PendingNewsItem[]> {
  const rows = await query<{
    id: string;
    title: string;
    source: string;
    published_at: unknown;
  }>(
    `select id, title, source, published_at
       from public.news_items
      where classified_at is null
      order by published_at asc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    source: row.source,
    publishedAt:
      row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
  }));
}

async function defaultLoadAssetIdMap(): Promise<Record<string, number>> {
  const rows = await query<{ id: string; symbol: string }>(
    'select id, symbol from public.assets where symbol = any($1)',
    [TRACKED_SYMBOLS],
  );
  return Object.fromEntries(rows.map((row) => [row.symbol, Number(row.id)]));
}

// ---------------------------------------------------------------------------
// Batch call
// ---------------------------------------------------------------------------

function buildUserMessage(batch: readonly PendingNewsItem[]): string {
  const lines = batch.map(
    (item) =>
      `- id: ${item.id}\n  source: ${item.source}\n  published_at: ${item.publishedAt}\n  headline: ${item.title}`,
  );
  return `Classify these ${batch.length} crypto news headlines. Return exactly one classify_news entry for every id.\n\n${lines.join('\n')}`;
}

interface BatchOutcome {
  inserts: ClassificationInsert[];
  /** Every item id in the batch — all terminal once a batch call succeeds. */
  terminalItemIds: number[];
  droppedCount: number;
}

/**
 * One structured tool-use call for `batch`. Throws on an API error or a
 * malformed tool block (no `tool_use`, missing array) — the caller turns that
 * into a failed `SourceStatus` and persists nothing. A successful call marks
 * every item in the batch terminal (an id the model saw and did not return is
 * an implicit drop, so it is not retried forever); only the valid entries
 * become insert rows.
 */
async function classifyBatch(
  client: Anthropic,
  batch: readonly PendingNewsItem[],
  trackedSymbols: readonly string[],
  assetIdBySymbol: Record<string, number>,
): Promise<BatchOutcome> {
  const response = await client.messages.create({
    model: NEWS_CLASSIFY_MODEL,
    max_tokens: 2048,
    system: NEWS_CLASSIFY_SYSTEM_PROMPT,
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Return an impact classification for every crypto news headline id supplied in the prompt.',
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: buildUserMessage(batch) }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('classifier returned no tool_use block');
  }

  const input = toolUse.input as { classifications?: unknown };
  if (!Array.isArray(input.classifications)) {
    throw new Error('classifier tool input missing classifications array');
  }

  const byId = new Map<string, RawClassification>();
  for (const entry of input.classifications as RawClassification[]) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
      byId.set(entry.id, entry);
    }
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = computeModelCostUsd(NEWS_CLASSIFY_MODEL, inputTokens, outputTokens);

  const inserts: ClassificationInsert[] = [];
  let droppedCount = 0;

  for (const item of batch) {
    const raw = byId.get(String(item.id));
    if (!raw) {
      droppedCount += 1;
      continue;
    }

    const result = validateClassification(raw, trackedSymbols);
    if (!result.ok) {
      droppedCount += 1;
      continue;
    }

    const { value } = result;
    const assetId = value.assetSymbol ? (assetIdBySymbol[value.assetSymbol] ?? null) : null;
    if (value.assetSymbol && assetId === null) {
      // Asset scope we cannot resolve to an `assets.id` — dropping is safer
      // than writing a row that violates the FK / scope-asset check.
      droppedCount += 1;
      continue;
    }

    inserts.push({
      newsItemId: item.id,
      scope: value.scope,
      assetId,
      direction: value.direction,
      magnitude: value.magnitude,
      horizonHours: value.horizonHours,
      confidence: value.confidence,
      rationale: value.rationale,
      model: NEWS_CLASSIFY_MODEL,
      promptVersion: NEWS_PROMPT_VERSION,
      inputTokens,
      outputTokens,
      costUsd,
    });
  }

  return { inserts, terminalItemIds: batch.map((item) => item.id), droppedCount };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Classifies up to `NEWS_CLASSIFY_MAX_PER_RUN` unclassified news items in
 * batches of `NEWS_CLASSIFY_BATCH_SIZE`. Never throws: every failure path
 * returns a `SourceStatus` and leaves the DB untouched for the failed batch.
 */
export async function classifyNews(deps: ClassifyNewsDeps = {}): Promise<ClassifyNewsResult> {
  const now = deps.now ?? new Date();

  // Mock mode: no API call, no DB, no-op ok status.
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return { sources: [{ source: SOURCE, ok: true }], classified: 0, dropped: 0 };
  }

  const loadLastRunAt = deps.loadLastRunAt ?? defaultLoadLastRunAt;
  const loadPendingItems = deps.loadPendingItems ?? defaultLoadPendingItems;
  const loadAssetIdMap = deps.loadAssetIdMap ?? defaultLoadAssetIdMap;
  const persist = deps.persist ?? persistClassifications;

  // Cadence gate.
  let lastRunAt: Date | null;
  try {
    lastRunAt = await loadLastRunAt();
  } catch (error: unknown) {
    return {
      sources: [{ source: SOURCE, ok: false, error: errorMessage(error) }],
      classified: 0,
      dropped: 0,
    };
  }
  if (!isCadenceElapsed(lastRunAt, now)) {
    return { sources: [{ source: SOURCE, ok: true }], classified: 0, dropped: 0 };
  }

  // Work list, capped.
  let pending: PendingNewsItem[];
  try {
    pending = await loadPendingItems(NEWS_CLASSIFY_MAX_PER_RUN);
  } catch (error: unknown) {
    return {
      sources: [{ source: SOURCE, ok: false, error: errorMessage(error) }],
      classified: 0,
      dropped: 0,
    };
  }
  if (pending.length === 0) {
    return { sources: [{ source: SOURCE, ok: true }], classified: 0, dropped: 0 };
  }

  let assetIdBySymbol: Record<string, number>;
  try {
    assetIdBySymbol = await loadAssetIdMap();
  } catch (error: unknown) {
    return {
      sources: [{ source: SOURCE, ok: false, error: errorMessage(error) }],
      classified: 0,
      dropped: 0,
    };
  }

  const client = deps.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const sources: SourceStatus[] = [];
  let classified = 0;
  let dropped = 0;

  for (let offset = 0; offset < pending.length; offset += NEWS_CLASSIFY_BATCH_SIZE) {
    const batch = pending.slice(offset, offset + NEWS_CLASSIFY_BATCH_SIZE);
    try {
      const outcome = await classifyBatch(client, batch, TRACKED_SYMBOLS, assetIdBySymbol);
      // Insert rows + stamp classified_at in one transaction.
      await persist(outcome.inserts, outcome.terminalItemIds);
      classified += outcome.inserts.length;
      dropped += outcome.droppedCount;
    } catch (error: unknown) {
      // API error, malformed tool output, or transaction failure. Write
      // nothing for this batch; its items stay classified_at IS NULL and are
      // retried next run. Stop here — a failing model call will keep failing.
      console.error('[news:classify] batch failed:', error);
      sources.push({ source: SOURCE, ok: false, error: errorMessage(error) });
      return { sources, classified, dropped };
    }
  }

  sources.push({ source: SOURCE, ok: true });
  return { sources, classified, dropped };
}
