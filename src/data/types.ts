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

export interface Position {
  sym: string;
  name: string;
  qty: number;
  avg: number;
  mark: number;
  alloc: number;
  target: number;
}

export interface Transaction {
  d: string;
  t: 'Buy' | 'Sell' | 'Stake' | 'Reward';
  sym: string;
  qty: string;
  px: string;
  val: string;
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

export interface Model {
  name: string;
  kind: string;
  acc: number;
  hits: string;
  weight: number;
  status: 'ACTIVE' | 'PAUSED';
}

export interface Prediction {
  sym: string;
  dir: 'long' | 'short';
  hz: string;
  target: string;
  model?: string;
  conf: number;
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

export interface HoldingSegment {
  name: string;
  value: number;
  color: string;
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
  coins: Array<'BTC' | 'ETH' | 'SOL' | 'LINK' | 'ARB' | 'TAO'>;
}

export interface SignalsResponse {
  lastUpdated: string;
  nextUpdate: string;
  fetchError?: boolean;
  signals: SignalItem[];
}

export interface ForecastPoint {
  d: number; // days from generation date (generatedAt), >= 1
  p: number; // USD price
}

export type ProjectionRange = (typeof RANGE_OPTIONS)[number];

export interface ProjectionData {
  coin: string;
  bull: ForecastPoint[];
  base: ForecastPoint[];
  bear: ForecastPoint[];
  /** AI's anchor price at generation time; used only as the rescale denominator (via anchorScenario), never rendered directly. */
  currentPrice: number;
  generatedAt: string;
  confidence: number;
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
