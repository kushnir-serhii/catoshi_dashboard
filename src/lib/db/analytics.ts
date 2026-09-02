import { FORECAST_MODEL_PRICING } from '@/consts/forecastPricing';
import { query } from '@/lib/db/client';
import type { ForecastUsage, MarketSnapshot, ProjectionData, StoredForecast } from '@/data/types';

/**
 * Data-access module for the analytics tables (spec 010): `snapshots` and
 * `forecasts`. Plain, honestly-erroring queries — no fire-and-forget
 * swallowing here (that lands in Slice 6's `/api/projections` integration).
 *
 * `assetId` throughout this module is the already-resolved `assets.id`
 * foreign key (a bigint). Resolving a symbol (e.g. "BTC") to that id is the
 * caller's responsibility — the future snapshotBuilder.ts / `/api/collect`
 * — so this module stays a thin, single-purpose data layer. The one
 * exception is `getLatestSnapshot`, which also accepts a symbol string for
 * convenience since callers often only have the symbol on hand; see below.
 *
 * Numeric coercion note: `pg` parses Postgres `numeric` columns as strings
 * (to avoid silent precision loss on values that don't fit a JS number), but
 * `double precision`/`integer`/`jsonb` columns come back already as
 * number/object. `MarketSnapshot`/`StoredForecast` type every numeric field
 * as `number | null` regardless of the underlying Postgres type, so any
 * column declared `numeric` in the migration (`price`, `market_cap_usd`,
 * `volume_24h_usd`, `ma7_1d`/`ma25_1d`/`ma99_1d`, `open_interest_usd`,
 * `liquidations_24h_usd`, `etf_net_flow_usd`, `etf_flow_7d_usd`,
 * `anchor_price`, `cost_usd`) is explicitly coerced with `toNumber` below.
 */

/** Null-safe string/number -> number coercion for Postgres `numeric` columns. */
function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** camelCase MarketSnapshot -> snake_case `snapshots` column/value pairs. */
function toSnapshotRow(snapshot: MarketSnapshot): Record<string, unknown> {
  return {
    asset_id: snapshot.assetId,
    ts: snapshot.ts,
    price: snapshot.price,

    market_cap_usd: snapshot.marketCapUsd,
    volume_24h_usd: snapshot.volume24hUsd,

    rsi_15m: snapshot.rsi15m,
    rsi_1h: snapshot.rsi1h,
    rsi_4h: snapshot.rsi4h,
    rsi_1d: snapshot.rsi1d,

    ma7_15m: snapshot.ma715m,
    ma25_15m: snapshot.ma2515m,
    ma99_15m: snapshot.ma9915m,
    atr_15m: snapshot.atr15m,
    volume_z_15m: snapshot.volumeZ15m,
    structure_15m: snapshot.structure15m,

    ma7_1h: snapshot.ma71h,
    ma25_1h: snapshot.ma251h,
    ma99_1h: snapshot.ma991h,
    atr_1h: snapshot.atr1h,
    volume_z_1h: snapshot.volumeZ1h,
    structure_1h: snapshot.structure1h,

    ma7_4h: snapshot.ma74h,
    ma25_4h: snapshot.ma254h,
    ma99_4h: snapshot.ma994h,
    atr_4h: snapshot.atr4h,
    volume_z_4h: snapshot.volumeZ4h,
    structure_4h: snapshot.structure4h,

    ma7_1d: snapshot.ma7Daily,
    ma25_1d: snapshot.ma25Daily,
    ma99_1d: snapshot.ma99Daily,
    pct_from_ma7_1d: snapshot.pctFromMa7Daily,
    pct_from_ma25_1d: snapshot.pctFromMa25Daily,
    pct_from_ma99_1d: snapshot.pctFromMa99Daily,

    atr_1d: snapshot.atrDaily,
    volume_z_1d: snapshot.volumeZDaily,
    structure_1d: snapshot.structureDaily,

    funding_rate: snapshot.fundingRate,
    funding_rate_delta_24h: snapshot.fundingRateDelta24h,
    open_interest_usd: snapshot.openInterestUsd,
    open_interest_change_24h_pct: snapshot.openInterestChange24hPct,
    long_short_ratio: snapshot.longShortRatio,
    liquidations_24h_usd: snapshot.liquidations24hUsd,
    liquidations_dominant_side: snapshot.liquidationsDominantSide,

    etf_net_flow_usd: snapshot.etfNetFlowUsd,
    etf_streak_days: snapshot.etfStreakDays,
    etf_flow_7d_usd: snapshot.etfFlow7dUsd,
    fear_greed: snapshot.fearGreed,
    fear_greed_7d_ago: snapshot.fearGreed7dAgo,

    raw: snapshot.raw,
  };
}

/** Ordered column list shared by the snapshot INSERT and its ON CONFLICT SET clause. */
const SNAPSHOT_COLUMNS = [
  'asset_id',
  'ts',
  'price',
  'market_cap_usd',
  'volume_24h_usd',
  'rsi_15m',
  'rsi_1h',
  'rsi_4h',
  'rsi_1d',
  'ma7_15m',
  'ma25_15m',
  'ma99_15m',
  'atr_15m',
  'volume_z_15m',
  'structure_15m',
  'ma7_1h',
  'ma25_1h',
  'ma99_1h',
  'atr_1h',
  'volume_z_1h',
  'structure_1h',
  'ma7_4h',
  'ma25_4h',
  'ma99_4h',
  'atr_4h',
  'volume_z_4h',
  'structure_4h',
  'ma7_1d',
  'ma25_1d',
  'ma99_1d',
  'pct_from_ma7_1d',
  'pct_from_ma25_1d',
  'pct_from_ma99_1d',
  'atr_1d',
  'volume_z_1d',
  'structure_1d',
  'funding_rate',
  'funding_rate_delta_24h',
  'open_interest_usd',
  'open_interest_change_24h_pct',
  'long_short_ratio',
  'liquidations_24h_usd',
  'liquidations_dominant_side',
  'etf_net_flow_usd',
  'etf_streak_days',
  'etf_flow_7d_usd',
  'fear_greed',
  'fear_greed_7d_ago',
  'raw',
] as const;

/** snake_case `snapshots` row -> camelCase MarketSnapshot. */
function fromSnapshotRow(row: Record<string, unknown>): MarketSnapshot {
  return {
    id: row.id as number,
    assetId: row.asset_id as number,
    ts: row.ts as string,
    price: toNumber(row.price) as number,
    createdAt: row.created_at as string,

    marketCapUsd: toNumber(row.market_cap_usd),
    volume24hUsd: toNumber(row.volume_24h_usd),

    rsi15m: row.rsi_15m as number | null,
    rsi1h: row.rsi_1h as number | null,
    rsi4h: row.rsi_4h as number | null,
    rsi1d: row.rsi_1d as number | null,

    ma715m: toNumber(row.ma7_15m),
    ma2515m: toNumber(row.ma25_15m),
    ma9915m: toNumber(row.ma99_15m),
    atr15m: row.atr_15m as number | null,
    volumeZ15m: row.volume_z_15m as number | null,
    structure15m: row.structure_15m as MarketSnapshot['structure15m'],

    ma71h: toNumber(row.ma7_1h),
    ma251h: toNumber(row.ma25_1h),
    ma991h: toNumber(row.ma99_1h),
    atr1h: row.atr_1h as number | null,
    volumeZ1h: row.volume_z_1h as number | null,
    structure1h: row.structure_1h as MarketSnapshot['structure1h'],

    ma74h: toNumber(row.ma7_4h),
    ma254h: toNumber(row.ma25_4h),
    ma994h: toNumber(row.ma99_4h),
    atr4h: row.atr_4h as number | null,
    volumeZ4h: row.volume_z_4h as number | null,
    structure4h: row.structure_4h as MarketSnapshot['structure4h'],

    ma7Daily: toNumber(row.ma7_1d),
    ma25Daily: toNumber(row.ma25_1d),
    ma99Daily: toNumber(row.ma99_1d),
    pctFromMa7Daily: row.pct_from_ma7_1d as number | null,
    pctFromMa25Daily: row.pct_from_ma25_1d as number | null,
    pctFromMa99Daily: row.pct_from_ma99_1d as number | null,

    atrDaily: row.atr_1d as number | null,
    volumeZDaily: row.volume_z_1d as number | null,
    structureDaily: row.structure_1d as MarketSnapshot['structureDaily'],

    fundingRate: row.funding_rate as number | null,
    fundingRateDelta24h: row.funding_rate_delta_24h as number | null,
    openInterestUsd: toNumber(row.open_interest_usd),
    openInterestChange24hPct: row.open_interest_change_24h_pct as number | null,
    longShortRatio: row.long_short_ratio as number | null,
    liquidations24hUsd: toNumber(row.liquidations_24h_usd),
    liquidationsDominantSide: row.liquidations_dominant_side as MarketSnapshot['liquidationsDominantSide'],

    etfNetFlowUsd: toNumber(row.etf_net_flow_usd),
    etfStreakDays: row.etf_streak_days as number | null,
    etfFlow7dUsd: toNumber(row.etf_flow_7d_usd),
    fearGreed: row.fear_greed as number | null,
    fearGreed7dAgo: row.fear_greed_7d_ago as number | null,

    raw: (row.raw as Record<string, unknown>) ?? {},
  };
}

/** camelCase StoredForecast -> snake_case `forecasts` column/value pairs. */
function toForecastRow(forecast: StoredForecast): Record<string, unknown> {
  return {
    asset_id: forecast.assetId,
    snapshot_id: forecast.snapshotId,
    as_of: forecast.asOf,

    scenarios: forecast.scenarios,
    confidence: forecast.confidence,
    reasoning: forecast.reasoning,
    anchor_price: forecast.anchorPrice,

    source: forecast.source,
    model: forecast.model,
    prompt_version: forecast.promptVersion,
    schema_version: forecast.schemaVersion,

    input_tokens: forecast.inputTokens,
    output_tokens: forecast.outputTokens,
    cost_usd: forecast.costUsd,
  };
}

const FORECAST_COLUMNS = [
  'asset_id',
  'snapshot_id',
  'as_of',
  'scenarios',
  'confidence',
  'reasoning',
  'anchor_price',
  'source',
  'model',
  'prompt_version',
  'schema_version',
  'input_tokens',
  'output_tokens',
  'cost_usd',
] as const;

/** snake_case `forecasts` row -> camelCase StoredForecast. */
function fromForecastRow(row: Record<string, unknown>): StoredForecast {
  return {
    id: row.id as number,
    assetId: row.asset_id as number,
    snapshotId: row.snapshot_id as number | null,
    asOf: row.as_of as string,
    createdAt: row.created_at as string,
    scenarios: row.scenarios as StoredForecast['scenarios'],
    confidence: row.confidence as number | null,
    reasoning: row.reasoning as string[] | null,
    anchorPrice: toNumber(row.anchor_price),
    source: row.source as string,
    model: row.model as string,
    promptVersion: row.prompt_version as string,
    schemaVersion: row.schema_version as string | null,
    inputTokens: row.input_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    costUsd: toNumber(row.cost_usd),
  };
}

/**
 * Upserts one snapshot row on the `(asset_id, ts)` unique constraint —
 * re-running the hourly collection job for an hour that already has a row
 * updates it in place instead of erroring or duplicating. Every non-key
 * column is included in the `ON CONFLICT ... DO UPDATE SET` clause so a
 * re-run fully replaces stale values with the latest collection run's data.
 *
 * `snapshot.assetId` must already be the resolved `assets.id`; this function
 * does no symbol lookup.
 */
export async function upsertSnapshot(
  snapshot: MarketSnapshot,
): Promise<{ data: MarketSnapshot | null; error: Error | null }> {
  const row = toSnapshotRow(snapshot);
  const values = SNAPSHOT_COLUMNS.map((column) => row[column]);
  const placeholders = SNAPSHOT_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
  // Every column except the (asset_id, ts) conflict key gets refreshed.
  const updateSet = SNAPSHOT_COLUMNS.filter((column) => column !== 'asset_id' && column !== 'ts')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  const sql = `
    insert into snapshots (${SNAPSHOT_COLUMNS.join(', ')})
    values (${placeholders})
    on conflict (asset_id, ts) do update set ${updateSet}
    returning *
  `;

  try {
    const rows = await query<Record<string, unknown>>(sql, values);
    return { data: fromSnapshotRow(rows[0]), error: null };
  } catch (error: unknown) {
    console.error('[analytics] upsertSnapshot failed:', error);
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Inserts one row per forecast — never an upsert. Every forecast generation
 * (cache miss) is its own row per AC 2.1, so re-generating a forecast for
 * the same asset/time does not overwrite history.
 */
export async function insertForecasts(
  forecasts: StoredForecast[],
): Promise<{ data: StoredForecast[] | null; error: Error | null }> {
  if (forecasts.length === 0) {
    return { data: [], error: null };
  }

  const columnCount = FORECAST_COLUMNS.length;
  const values: unknown[] = [];
  const rowPlaceholders = forecasts.map((forecast, rowIndex) => {
    const row = toForecastRow(forecast);
    const placeholders = FORECAST_COLUMNS.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columnCount + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const sql = `
    insert into forecasts (${FORECAST_COLUMNS.join(', ')})
    values ${rowPlaceholders.join(', ')}
    returning *
  `;

  try {
    const rows = await query<Record<string, unknown>>(sql, values);
    return { data: rows.map(fromForecastRow), error: null };
  } catch (error: unknown) {
    console.error('[analytics] insertForecasts failed:', error);
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Returns the most recent snapshot for an asset, or null if none exists.
 *
 * Accepts either the numeric `assets.id` (queried directly against
 * `snapshots.asset_id`) or a symbol string such as `"BTC"` (resolved via the
 * `assets` table first) — callers building a snapshot often only have the
 * symbol on hand, so this convenience lookup is worth the extra query here
 * rather than pushing symbol resolution onto every caller.
 */
export async function getLatestSnapshot(assetId: number | string): Promise<MarketSnapshot | null> {
  let resolvedAssetId: number;

  if (typeof assetId === 'number') {
    resolvedAssetId = assetId;
  } else {
    try {
      const assets = await query<{ id: number }>('select id from assets where symbol = $1', [assetId]);
      if (assets.length === 0) {
        return null;
      }
      resolvedAssetId = assets[0].id;
    } catch (error: unknown) {
      console.error('[analytics] getLatestSnapshot asset lookup failed:', error);
      return null;
    }
  }

  try {
    const rows = await query<Record<string, unknown>>(
      'select * from snapshots where asset_id = $1 order by ts desc limit 1',
      [resolvedAssetId],
    );
    return rows.length > 0 ? fromSnapshotRow(rows[0]) : null;
  } catch (error: unknown) {
    console.error('[analytics] getLatestSnapshot failed:', error);
    return null;
  }
}

/**
 * Returns the snapshot immediately preceding `ts` for an asset, or null if none
 * exists. Used by signal generation (spec 014, Slice 4) both to feed rules that
 * compare against the prior hour and to resolve `since_ts` carry-forward.
 * Reuses `fromSnapshotRow` so the row -> `MarketSnapshot` mapping is not
 * duplicated.
 */
export async function getSnapshotBefore(assetId: number, ts: string): Promise<MarketSnapshot | null> {
  try {
    const rows = await query<Record<string, unknown>>(
      'select * from snapshots where asset_id = $1 and ts < $2 order by ts desc limit 1',
      [assetId, ts],
    );
    return rows.length > 0 ? fromSnapshotRow(rows[0]) : null;
  } catch (error: unknown) {
    console.error('[analytics] getSnapshotBefore failed:', error);
    return null;
  }
}

/**
 * Computes best-effort USD cost from token counts using `FORECAST_MODEL_PRICING`
 * (src/consts/forecastPricing.ts). Returns null for an unrecognized model
 * rather than guessing — a null `cost_usd` is preferable to a silently wrong
 * one. Rounded to 6 decimal places to match the `numeric(12, 6)` column.
 */
function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = FORECAST_MODEL_PRICING[model];
  if (!pricing) return null;
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Builds `StoredForecast` rows from one batch of `ProjectionData` (one AI
 * call producing projections for every target coin at once — see
 * `buildPrompt` in src/lib/forecast/claude.ts and openai.ts) and inserts them
 * via `insertForecasts`.
 *
 * Token-usage attribution: a single batch call's `usage` covers ALL coins in
 * `projections` together (the prompt lists every target coin, and the model
 * emits one response covering all of them) — there is no way to know how
 * many of the input/output tokens "belong" to any one coin. Rather than
 * guess a split, this stores the FULL batch usage (and the cost computed
 * from it) on every row. This is a known, documented limitation: summing
 * `cost_usd`/`input_tokens` across rows from the SAME generation will
 * over-count by a factor of N (the number of coins); the correct aggregate
 * cost for one generation is the value on any single row from that batch,
 * not the sum. This keeps each row individually accurate for
 * "what did generating THIS forecast cost, all-in" while avoiding a
 * fabricated per-coin split that would imply precision that isn't there.
 *
 * `snapshotIds` maps coin symbol (e.g. "BTC") -> that coin's most recent
 * `snapshots.id`, or null when no snapshot exists yet for it (nullable FK).
 *
 * `promptVersion` comes from the provider module's exported `PROMPT_VERSION`
 * (see `ForecastGenerationResult.promptVersion`); passed in here rather than
 * re-derived, since only the caller (which already called `generateForecast`)
 * has it on hand.
 */
export async function persistForecasts(
  projections: ProjectionData[],
  snapshotIds: Record<string, number | null>,
  usage: ForecastUsage,
  promptVersion: number,
): Promise<{ data: StoredForecast[] | null; error: Error | null }> {
  if (projections.length === 0) {
    return { data: [], error: null };
  }

  const symbols = Array.from(new Set(projections.map((p) => p.coin)));
  let assetIdBySymbol: Record<string, number>;
  try {
    const rows = await query<{ id: number; symbol: string }>(
      'select id, symbol from assets where symbol = any($1)',
      [symbols],
    );
    assetIdBySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row.id]));
  } catch (error: unknown) {
    console.error('[analytics] persistForecasts asset lookup failed:', error);
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }

  const forecasts: StoredForecast[] = [];
  for (const projection of projections) {
    const assetId = assetIdBySymbol[projection.coin];
    if (assetId === undefined) {
      // Not every forecasted coin necessarily has an `assets` row (e.g. an
      // arbitrary on-demand reforecast target) — skip rather than fail the
      // whole batch, since the other coins' rows are still worth persisting.
      console.warn(`[analytics] persistForecasts: no assets row for symbol "${projection.coin}", skipping`);
      continue;
    }

    forecasts.push({
      assetId,
      snapshotId: snapshotIds[projection.coin] ?? null,
      asOf: projection.generatedAt,

      scenarios: projection.scenarioProbabilities,
      confidence: projection.confidence,
      reasoning: projection.reasoning,
      anchorPrice: projection.currentPrice,

      source: projection.service,
      model: projection.model,
      promptVersion: String(promptVersion),
      schemaVersion: String(projection.schemaVersion),

      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: computeCostUsd(projection.model, usage.inputTokens, usage.outputTokens),
    });
  }

  return insertForecasts(forecasts);
}
