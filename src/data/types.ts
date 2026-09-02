import type { PROJECTION_SCHEMA_VERSION, RANGE_OPTIONS } from '@/consts/projections';

export type AssetPrice = { usd: number; usd_24h_change: number };
export type PriceMap = Record<string, AssetPrice>;

export interface KpiItem {
  lbl: string;
  val: string;
  deltaText: string;
  deltaClass: string;
  subText?: string;
  sparkSeed?: number;
  sparkColor?: 'green' | 'violet' | 'red';
}

export interface Sector {
  name: string;
  count: number;
  change: string;
  up: boolean;
}

export interface MarketAsset {
  sym: string;
  name: string;
  px: string;
  d24: string;
  up: boolean;
  vol: string;
  mc: string;
  proj: string;
  conf: number;
  sparkline: number[];
}

export interface Signal {
  side: 'bullish' | 'bearish' | 'neutral';
  tag: string;
  src: string;
  title: string;
  body?: string;
  meta: string;
  conf?: number;
}

export interface WatchlistRow {
  sym: string;
  name: string;
  price: string;
  d24: string;
  up: boolean;
  proj: string;
  side: 'bull' | 'bear';
  spark: number;
}

export interface KPIsProps {
  items: KpiItem[];
  isLoading: boolean;
  isStale: boolean;
  countdown: number;
}

export interface SignalItem {
  id: string;
  tag: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  title: string;
  body: string;
  source: string;
  publishedAt: string;
  /**
   * ISO timestamp the underlying condition was first observed (mapped from
   * `public.signals.since_ts`). `publishedAt` is the snapshot the row was
   * derived from; `since` is how long the condition has held — the card renders
   * a duration from it (spec 014 slice 5).
   */
  since: string;
  coins: Array<'BTC' | 'ETH' | 'SOL' | 'LINK' | 'ARB' | 'TAO'>;
}

/** Scope of a news signal: the whole market, or one tracked asset. */
export type NewsScope = 'market' | 'BTC' | 'ETH' | 'SOL';

/**
 * A classified news headline published into the feed (spec 015, kind = 'news').
 * Kept as its own shape rather than folded into `SignalItem` so the market-state
 * row contract is untouched (functional-spec 2.3: market-state signals are
 * unaffected by this spec). The Signals page renders these in a distinct
 * section.
 */
export interface NewsSignalItem {
  id: string;
  kind: 'news';
  tag: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  title: string;
  /** One-sentence classifier rationale (`news_classifications.rationale`). */
  body: string;
  /** Source name (`news_items.source`), e.g. "coindesk". */
  source: string;
  /** Outbound link to the original article (`news_items.url`). */
  sourceUrl: string;
  /** The article's own publication time — drives the displayed age. Never classification/render time. */
  publishedAt: string;
  /** `published_at + horizon_hours`. Past this the row is excluded from live results. */
  expiresAt: string;
  scope: NewsScope;
  magnitude: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Fixed severity point derived from `magnitude` — shared ordering axis with market-state rows. */
  severity: number;
  horizonHours: number;
  /** Classifier's own certainty, held separately from magnitude. */
  confidence: number;
}

export interface SignalsResponse {
  /** ISO `ts` of the newest snapshot backing this feed, or null when none exists. */
  lastUpdated: string | null;
  /** ISO time collection is next expected to run (newest snapshot `ts` + interval), or null. */
  nextUpdate?: string | null;
  /** True when the feed could not be read (dead DB, or the `signals`/`snapshots` table is absent). */
  fetchError?: boolean;
  /**
   * True when the snapshot store was read successfully. An empty `signals` array with
   * `collectionHealthy: true` means "healthy, nothing to report" — distinct from `fetchError`.
   */
  collectionHealthy?: boolean;
  signals: SignalItem[];
  /**
   * Live classified-news signals (spec 015). Additive: absent/empty means no
   * news item is currently live. Ordered by severity then recency, already
   * filtered to `expires_at > now()` and to any `?scope=` requested.
   */
  newsSignals?: NewsSignalItem[];
}

export interface ForecastPoint {
  d: number; // days from generation date (generatedAt), >= 1
  p: number; // USD price
}

export type ProjectionRange = (typeof RANGE_OPTIONS)[number];

/** Likelihood the AI assigns each scenario, in whole percentage points summing to 100. */
export interface ScenarioProbabilities {
  bull: number;
  base: number;
  bear: number;
}

export interface ProjectionData {
  coin: string;
  bull: ForecastPoint[];
  base: ForecastPoint[];
  bear: ForecastPoint[];
  /** AI's anchor price at generation time; used only as the rescale denominator (via anchorScenario), never rendered directly. */
  currentPrice: number;
  generatedAt: string;
  confidence: number;
  /** Likelihood of each scenario playing out, distinct from `confidence` (the AI's overall certainty). */
  scenarioProbabilities: ScenarioProbabilities;
  reasoning: string[];
  service: 'claude' | 'openai';
  model: string;
  schemaVersion: typeof PROJECTION_SCHEMA_VERSION;
}

export interface ForecastSnapshot {
  id: string;
  name: string;
  savedAt: string;
  coin: string;
  service: string;
  model: string;
  projection: ProjectionData;
}

export interface ProjectionsResponse {
  projections: ProjectionData[];
  generatedAt: string;
}

/** Token counts for one provider API call, used for analytics cost tracking. */
export interface ForecastUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Return shape of `generateClaudeForecast`/`generateOpenAIForecast`/
 * `generateForecast` (spec 010 Slice 6). `promptVersion` and `usage` ride
 * alongside the projections so callers can persist them (see
 * `src/lib/db/analytics.ts#persistForecasts`) without the provider modules
 * needing to know anything about persistence themselves.
 */
export interface ForecastGenerationResult {
  projections: ProjectionData[];
  promptVersion: number;
  usage: ForecastUsage;
}

export interface HistoricalPrice {
  timestamp: number;
  price: number;
}

export interface HistoricalPricesResponse {
  prices: HistoricalPrice[];
}

export interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
}

export interface MarketListItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d: { price: number[] };
}

/**
 * Mirrors a row of `public.snapshots` (db/migrations/0001_analytics.sql).
 * camelCase field names map to snake_case columns 1:1 (e.g. `pctFromMa7Daily`
 * <-> `pct_from_ma7_1d`) — see the column map in src/lib/db/analytics.ts.
 *
 * `assetId` is the already-resolved `assets.id` foreign key, not a symbol —
 * resolving symbol -> id is the caller's job (the future snapshotBuilder.ts /
 * `/api/collect`), keeping this module a plain data-access layer.
 *
 * Nullability matches the migration: every indicator/derivative/flow column
 * is nullable; only `assetId`, `ts` and `price` are required.
 */
export interface MarketSnapshot {
  id?: number;
  assetId: number;
  ts: string;
  price: number;
  createdAt?: string;

  marketCapUsd: number | null;
  volume24hUsd: number | null;

  rsi15m: number | null;
  rsi1h: number | null;
  rsi4h: number | null;
  rsi1d: number | null;

  ma715m: number | null;
  ma2515m: number | null;
  ma9915m: number | null;
  atr15m: number | null;
  volumeZ15m: number | null;
  structure15m: 'HH-HL' | 'LH-LL' | 'RANGE' | null;

  ma71h: number | null;
  ma251h: number | null;
  ma991h: number | null;
  atr1h: number | null;
  volumeZ1h: number | null;
  structure1h: 'HH-HL' | 'LH-LL' | 'RANGE' | null;

  ma74h: number | null;
  ma254h: number | null;
  ma994h: number | null;
  atr4h: number | null;
  volumeZ4h: number | null;
  structure4h: 'HH-HL' | 'LH-LL' | 'RANGE' | null;

  ma7Daily: number | null;
  ma25Daily: number | null;
  ma99Daily: number | null;
  pctFromMa7Daily: number | null;
  pctFromMa25Daily: number | null;
  pctFromMa99Daily: number | null;

  atrDaily: number | null;
  volumeZDaily: number | null;
  structureDaily: 'HH-HL' | 'LH-LL' | 'RANGE' | null;

  fundingRate: number | null;
  fundingRateDelta24h: number | null;
  openInterestUsd: number | null;
  openInterestChange24hPct: number | null;
  longShortRatio: number | null;
  liquidations24hUsd: number | null;
  liquidationsDominantSide: 'long' | 'short' | null;

  etfNetFlowUsd: number | null;
  etfStreakDays: number | null;
  etfFlow7dUsd: number | null;
  fearGreed: number | null;
  fearGreed7dAgo: number | null;

  /** Full payload of everything gathered, so a new source needs no migration. */
  raw: Record<string, unknown>;
}

/**
 * Stored shape of `public.forecasts.scenarios` (jsonb). Carries the three
 * per-scenario price curves alongside the scenario probabilities, so a resolver
 * (spec 011) can look up the predicted price at any horizon and score the
 * probabilities against the realized scenario without re-calling the model.
 *
 * `probabilities` is read by the `forecasts_scenarios_probability_sum` trigger
 * (db/migrations/0001) — the key name matches its `-> 'probabilities'` lookup.
 */
export interface StoredForecastScenarios {
  bull: ForecastPoint[];
  base: ForecastPoint[];
  bear: ForecastPoint[];
  probabilities: ScenarioProbabilities;
}

/**
 * Mirrors a row of `public.forecasts` (db/migrations/0001_analytics.sql).
 * One row per generation (never upserted) — see AC 2.1.
 *
 * Nullability matches the migration: `assetId`, `asOf`, `scenarios`, `source`,
 * `model` and `promptVersion` are required; everything else is nullable.
 */
export interface StoredForecast {
  id?: number;
  assetId: number;
  snapshotId: number | null;
  asOf: string;
  createdAt?: string;

  scenarios: StoredForecastScenarios;
  confidence: number | null;
  reasoning: string[] | null;
  anchorPrice: number | null;

  source: string;
  model: string;
  promptVersion: string;
  schemaVersion: string | null;

  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

/**
 * Outcome of one parallel data-collection attempt (klines, funding, ETF
 * flows, fear/greed, etc.). Kept deliberately generic — consumed by the
 * future snapshotBuilder.ts / `/api/collect` to report per-source success or
 * failure without over-fitting to today's source list.
 */
export interface SourceStatus {
  source: string;
  ok: boolean;
  error?: string;
}

/**
 * Spec 011 Slice 5 — the calibration read model for the Models page.
 *
 * Every figure here is read straight from the `public.calibration_*` views
 * (db/migrations/0006). The exclusions are defined once, in SQL; these types
 * only carry the numbers to the UI. Nothing is computed in the route or the
 * hook — the page compares `meanBrier` to `NO_SKILL_BRIER_BASELINE` and
 * `scoredCount` to `MIN_SCORED_SAMPLE_SIZE` for rendering only.
 */
export interface ModelTrendPoint {
  /** First day of the calendar month, ISO. */
  month: string;
  meanBrier: number;
  scoredCount: number;
}

export interface ModelCalibrationGroup {
  model: string;
  promptVersion: string;
  /** Scoreable outcomes behind `meanBrier` (back-filled / unlinked / unscoreable already removed). */
  scoredCount: number;
  /** Mean multi-class Brier over `scoredCount` rows, or null when nothing is scoreable yet. */
  meanBrier: number | null;
  /** Resolved outcomes for this group set aside, by reason. */
  excludedCount: number;
  excludedBackfilled: number;
  excludedUnlinked: number;
  excludedUnscoreable: number;
  /** Total resolved outcomes for this group (scored + excluded). */
  totalOutcomes: number;
  trend: ModelTrendPoint[];
}

export interface ModelsExclusionSummary {
  totalOutcomes: number;
  scoredCount: number;
  excludedCount: number;
  excludedBackfilled: number;
  excludedUnlinked: number;
  excludedUnscoreable: number;
}

export interface ModelsResponse {
  groups: ModelCalibrationGroup[];
  exclusions: ModelsExclusionSummary;
  /** True when the calibration views could not be read (dead DB, missing view). */
  fetchError?: boolean;
}
