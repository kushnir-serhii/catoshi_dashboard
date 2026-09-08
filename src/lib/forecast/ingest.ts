import type { ForecastTarget } from '@/consts/projections';
import { INGEST_ANCHOR_MAX_DEVIATION_PCT, PROJECTION_SCHEMA_VERSION } from '@/consts/projections';
import type { ForecastPoint, ProjectionData } from '@/data/types';

import { normalizeProbabilities, snapScenarioToGrid } from './gridSnap';

/**
 * Pure validation + normalisation of a batch handed to `POST /api/projections/ingest`
 * by the scheduled Claude task (spec 020). No I/O — the caller resolves the
 * server-trusted `references` (reference price + `assets` row existence per coin)
 * and passes them in.
 *
 * Every check in functional-spec §2.4 that fails rejects the **whole batch**
 * (the route answers 422); unknown / assets-less coins are *skipped*, not
 * rejected, and reported so they do not silently vanish. The reference-price
 * resolution itself and the `/api/health` recording are Slice 3 / Slice 4.
 */

/** Raw shape of one projection in the ingest payload (the served output schema). */
interface RawProjection {
  coin: unknown;
  currentPrice: unknown;
  confidence: unknown;
  scenarioProbabilities: unknown;
  reasoning: unknown;
  bull: unknown;
  base: unknown;
  bear: unknown;
}

export interface IngestPayload {
  /** Model id the producer reports — stored on every row of the batch. */
  model?: unknown;
  projections?: unknown;
}

export interface IngestReference {
  /** Server-trusted price for the anchor check. `null` ⇒ unverifiable ⇒ reject. */
  referencePrice: number | null;
  /** Whether this coin has a `public.assets` row (required to persist). */
  hasAsset: boolean;
}

/** Keyed by upper-cased symbol, e.g. `BTC`. */
export type IngestReferences = Record<string, IngestReference>;

export type IngestCheck =
  | 'payload'
  | 'shape'
  | 'coverage'
  | 'probabilities'
  | 'anchor'
  | 'monotone'
  | 'positive-price';

export interface IngestRejection {
  coin: string;
  check: IngestCheck;
  detail: string;
}

export interface IngestSkip {
  coin: string;
  reason: 'unknown-coin' | 'no-asset-row';
}

export interface ValidateIngestResult {
  /** Fully-formed, grid-snapped projections ready for `persistForecasts`. */
  accepted: ProjectionData[];
  /** Non-empty ⇒ the whole batch is refused (HTTP 422). */
  rejections: IngestRejection[];
  /** Known-but-unpersistable coins, surfaced in the response. */
  skipped: IngestSkip[];
  /** `true` when nothing failed a hard check (`rejections` is empty). */
  ok: boolean;
}

export interface ValidateIngestOptions {
  /** The batch's `as_of` — set once by the route (`new Date().toISOString()`). */
  asOf: string;
  /** Coins the product forecasts; anything else in the payload is skipped. */
  targets: readonly ForecastTarget[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPointArray(value: unknown): value is Array<{ d: number; p: number }> {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        typeof point === 'object' &&
        point !== null &&
        isFiniteNumber((point as { d: unknown }).d) &&
        isFiniteNumber((point as { p: unknown }).p),
    )
  );
}

function strictlyIncreasing(points: readonly ForecastPoint[]): boolean {
  for (let i = 1; i < points.length; i++) {
    if (points[i].d <= points[i - 1].d) return false;
  }
  return true;
}

export function validateIngestBatch(
  payload: unknown,
  references: IngestReferences,
  options: ValidateIngestOptions,
): ValidateIngestResult {
  const rejections: IngestRejection[] = [];
  const skipped: IngestSkip[] = [];
  const accepted: ProjectionData[] = [];

  const reject = (coin: string, check: IngestCheck, detail: string): void => {
    rejections.push({ coin, check, detail });
  };

  if (typeof payload !== 'object' || payload === null) {
    reject('*', 'payload', 'body is not an object');
    return { accepted, rejections, skipped, ok: false };
  }

  const { model, projections } = payload as IngestPayload;
  if (typeof model !== 'string' || model.trim().length === 0) {
    reject('*', 'payload', 'missing model id');
  }
  if (!Array.isArray(projections)) {
    reject('*', 'payload', 'missing projections array');
    return { accepted, rejections, skipped, ok: false };
  }

  const targetSymbols = new Set(options.targets.map((t) => t.symbol.toUpperCase()));

  for (const raw of projections as RawProjection[]) {
    const coinRaw = typeof raw?.coin === 'string' ? raw.coin : '';
    const symbol = coinRaw.toUpperCase();

    if (!coinRaw || !isFiniteNumber(raw.currentPrice) || !isFiniteNumber(raw.confidence)) {
      reject(coinRaw || '(unnamed)', 'shape', 'coin, currentPrice and confidence are required');
      continue;
    }
    if (!Array.isArray(raw.reasoning) || !raw.reasoning.every((r) => typeof r === 'string')) {
      reject(coinRaw, 'shape', 'reasoning must be an array of strings');
      continue;
    }
    if (!isPointArray(raw.bull) || !isPointArray(raw.base) || !isPointArray(raw.bear)) {
      reject(coinRaw, 'shape', 'bull/base/bear must be arrays of {d,p} numbers');
      continue;
    }

    if (!targetSymbols.has(symbol)) {
      skipped.push({ coin: coinRaw, reason: 'unknown-coin' });
      continue;
    }
    const reference = references[symbol];
    if (!reference || !reference.hasAsset) {
      skipped.push({ coin: coinRaw, reason: 'no-asset-row' });
      continue;
    }

    const bull = snapScenarioToGrid(raw.bull);
    const base = snapScenarioToGrid(raw.base);
    const bear = snapScenarioToGrid(raw.bear);
    if (!bull || !base || !bear) {
      reject(coinRaw, 'coverage', 'a scenario was too sparse to snap to the forecast grid');
      continue;
    }

    const allPoints = [...bull, ...base, ...bear];
    if (!allPoints.every((point) => point.p > 0)) {
      reject(coinRaw, 'positive-price', 'every forecasted price must be > 0');
      continue;
    }
    if (!strictlyIncreasing(bull) || !strictlyIncreasing(base) || !strictlyIncreasing(bear)) {
      reject(coinRaw, 'monotone', 'day offsets must be strictly increasing after snapping');
      continue;
    }

    const probs = raw.scenarioProbabilities as
      | { bull?: unknown; base?: unknown; bear?: unknown }
      | null
      | undefined;
    const rawBull = Number(probs?.bull ?? 0);
    const rawBase = Number(probs?.base ?? 0);
    const rawBear = Number(probs?.bear ?? 0);
    const clampedTotal =
      Math.max(0, rawBull || 0) + Math.max(0, rawBase || 0) + Math.max(0, rawBear || 0);
    if (
      !Number.isFinite(rawBull) ||
      !Number.isFinite(rawBase) ||
      !Number.isFinite(rawBear) ||
      rawBull < 0 ||
      rawBase < 0 ||
      rawBear < 0 ||
      clampedTotal <= 0
    ) {
      reject(coinRaw, 'probabilities', 'scenario probabilities cannot normalise to 100');
      continue;
    }

    if (reference.referencePrice === null || reference.referencePrice <= 0) {
      reject(coinRaw, 'anchor', 'no server reference price to verify the anchor against');
      continue;
    }
    const deviationPct =
      (Math.abs(raw.currentPrice - reference.referencePrice) / reference.referencePrice) * 100;
    if (deviationPct > INGEST_ANCHOR_MAX_DEVIATION_PCT) {
      reject(
        coinRaw,
        'anchor',
        `currentPrice is ${deviationPct.toFixed(1)}% from the reference price (max ${INGEST_ANCHOR_MAX_DEVIATION_PCT}%)`,
      );
      continue;
    }

    accepted.push({
      coin: coinRaw,
      bull,
      base,
      bear,
      currentPrice: raw.currentPrice,
      generatedAt: options.asOf,
      confidence: raw.confidence,
      scenarioProbabilities: normalizeProbabilities({
        bull: rawBull,
        base: rawBase,
        bear: rawBear,
      }),
      reasoning: raw.reasoning,
      service: 'routine',
      model: model as string,
      schemaVersion: PROJECTION_SCHEMA_VERSION,
    });
  }

  // A rejected batch is rejected whole — never persisted partially
  // (functional-spec §2.4). Surface no accepted rows in that case.
  const ok = rejections.length === 0;
  return { accepted: ok ? accepted : [], rejections, skipped, ok };
}
