/**
 * Assembles one `MarketSnapshot` for a tracked asset by fanning out to every
 * collector in parallel, deriving indicators from whatever klines arrived,
 * and reporting per-source success/failure so a single failed API never
 * fails the whole snapshot (technical-considerations.md §2.3, AC 2.2).
 *
 * assetId resolution: `buildSnapshot` resolves `symbol` -> `assets.id` itself
 * via a DB lookup, rather than requiring the caller (the `/api/collect`
 * route) to pass the id in. This keeps the route handler a thin loop over
 * `COLLECT_ASSETS` and keeps "how a symbol maps to a DB row" entirely inside
 * this module, next to the rest of the assembly logic. The cost is one extra
 * `select` per asset per run (3 total) — negligible next to the external API
 * calls this function already makes in parallel.
 */
import { COLLECT_ASSETS, KLINE_LIMIT, MA_PERIODS, RSI_PERIOD, ATR_PERIOD, VOLUME_Z_LOOKBACK } from '@/consts/collect';
import type { MarketSnapshot, SourceStatus } from '@/data/types';
import { rsi, sma, atr, zScore, pctFrom, structure } from '@/lib/indicators';
import { fetchAllTimeframes, type OHLCV } from '@/lib/collectors/binanceKlines';
import { fetchFunding, fetchOpenInterest, fetchLongShortRatio } from '@/lib/collectors/binanceFutures';
import { fetchFearGreed } from '@/lib/collectors/fearGreed';
import { fetchEtfFlows } from '@/lib/collectors/etfFlows';
import { query } from '@/lib/db/client';

/** Trailing bars examined by `structure()`, same lookback for every timeframe. */
const STRUCTURE_LOOKBACK = 20;

/**
 * Looks up `assets.id` by symbol. Throws if the symbol has no row — this is
 * a configuration error (a mismatch between `COLLECT_ASSETS` and the seeded
 * `assets` table), not a transient source failure, so it should surface
 * loudly rather than become a silently-null field.
 */
async function resolveAssetId(symbol: string): Promise<number> {
  const rows = await query<{ id: number }>('select id from assets where symbol = $1', [symbol]);
  if (rows.length === 0) {
    throw new Error(`snapshotBuilder: no assets row for symbol "${symbol}"`);
  }
  return rows[0].id;
}

/** Wraps a settled promise result into a `[value | null, SourceStatus]` pair. */
function settle<T>(source: string, result: PromiseSettledResult<T>): [T | null, SourceStatus] {
  if (result.status === 'fulfilled') {
    return [result.value, { source, ok: true }];
  }
  const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return [null, { source, ok: false, error }];
}

/** Wraps a settled promise result whose fulfilled value may itself be `null` (collector reported "no data"). */
function settleNullable<T>(source: string, result: PromiseSettledResult<T | null>): [T | null, SourceStatus] {
  if (result.status === 'fulfilled') {
    if (result.value === null) {
      return [null, { source, ok: false, error: 'collector returned null' }];
    }
    return [result.value, { source, ok: true }];
  }
  const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return [null, { source, ok: false, error }];
}

export async function buildSnapshot(
  symbol: string,
  hourTs: Date,
): Promise<{ snapshot: MarketSnapshot; sources: SourceStatus[] }> {
  const asset = COLLECT_ASSETS.find((a) => a.symbol === symbol);
  if (!asset) {
    throw new Error(`snapshotBuilder: unknown symbol "${symbol}" (not in COLLECT_ASSETS)`);
  }
  const { binancePair } = asset;
  const isEtfEligible = symbol === 'ETH' || symbol === 'BTC';

  const [assetIdResult, klinesResult, fundingResult, oiResult, lsrResult, fearGreedResult, etfResult] =
    await Promise.allSettled([
      resolveAssetId(symbol),
      fetchAllTimeframes(binancePair, KLINE_LIMIT),
      fetchFunding(binancePair),
      fetchOpenInterest(binancePair),
      fetchLongShortRatio(binancePair),
      fetchFearGreed(),
      isEtfEligible ? fetchEtfFlows(symbol as 'ETH' | 'BTC') : Promise.resolve(null),
    ]);

  // assetId resolution failure is fatal — not a source we can null-out and
  // continue past, since there is no row to attach the snapshot to.
  if (assetIdResult.status === 'rejected') {
    const reason =
      assetIdResult.reason instanceof Error ? assetIdResult.reason.message : String(assetIdResult.reason);
    throw new Error(`snapshotBuilder: assetId resolution failed for "${symbol}": ${reason}`);
  }
  const assetId = assetIdResult.value;

  const sources: SourceStatus[] = [];

  const [klinesByTf, klinesStatus] = settle('klines', klinesResult);
  sources.push(klinesStatus);
  const [funding, fundingStatus] = settleNullable('funding', fundingResult);
  sources.push(fundingStatus);
  const [openInterest, oiStatus] = settleNullable('openInterest', oiResult);
  sources.push(oiStatus);
  const [longShortRatio, lsrStatus] = settleNullable('longShortRatio', lsrResult);
  sources.push(lsrStatus);
  const [fearGreed, fgStatus] = settleNullable('fearGreed', fearGreedResult);
  sources.push(fgStatus);

  let etfFlows: Awaited<ReturnType<typeof fetchEtfFlows>> = null;
  if (isEtfEligible) {
    const [etf, etfStatus] = settleNullable('etfFlows', etfResult);
    etfFlows = etf;
    sources.push(etfStatus);
  }
  // SOL has no ETF: not attempted, not a failure — no SourceStatus entry.

  // Report per-timeframe kline failures individually, since `fetchAllTimeframes`
  // itself never rejects (each timeframe is independently wrapped inside it).
  const daily: OHLCV[] | null = klinesByTf?.['1d'] ?? null;
  if (klinesByTf) {
    for (const tf of ['15m', '1h', '4h', '1d'] as const) {
      if (!klinesByTf[tf]) {
        sources.push({ source: `klines:${tf}`, ok: false, error: 'fetch failed' });
      }
    }
  }

  const kline15m = klinesByTf?.['15m'] ?? null;
  const kline1h = klinesByTf?.['1h'] ?? null;
  const kline4h = klinesByTf?.['4h'] ?? null;

  const closes15m = kline15m?.map((c) => c.close) ?? null;
  const highs15m = kline15m?.map((c) => c.high) ?? null;
  const lows15m = kline15m?.map((c) => c.low) ?? null;
  const volumes15m = kline15m?.map((c) => c.volume) ?? null;

  const closes1h = kline1h?.map((c) => c.close) ?? null;
  const highs1h = kline1h?.map((c) => c.high) ?? null;
  const lows1h = kline1h?.map((c) => c.low) ?? null;
  const volumes1h = kline1h?.map((c) => c.volume) ?? null;

  const closes4h = kline4h?.map((c) => c.close) ?? null;
  const highs4h = kline4h?.map((c) => c.high) ?? null;
  const lows4h = kline4h?.map((c) => c.low) ?? null;
  const volumes4h = kline4h?.map((c) => c.volume) ?? null;

  const closesDaily = daily?.map((c) => c.close) ?? null;
  const highsDaily = daily?.map((c) => c.high) ?? null;
  const lowsDaily = daily?.map((c) => c.low) ?? null;
  const volumesDaily = daily?.map((c) => c.volume) ?? null;

  const latestPrice = closesDaily && closesDaily.length > 0 ? closesDaily[closesDaily.length - 1] : null;

  const rsi15m = closes15m ? rsi(closes15m, RSI_PERIOD) : null;
  const rsi1h = closes1h ? rsi(closes1h, RSI_PERIOD) : null;
  const rsi4h = closes4h ? rsi(closes4h, RSI_PERIOD) : null;
  const rsi1d = closesDaily ? rsi(closesDaily, RSI_PERIOD) : null;

  // AC 2.4: moving averages, ATR, volume z-score and structure, mirroring the
  // daily block below, computed additionally for 15m/1h/4h.
  const ma715m = closes15m ? sma(closes15m, MA_PERIODS[0]) : null;
  const ma2515m = closes15m ? sma(closes15m, MA_PERIODS[1]) : null;
  const ma9915m = closes15m ? sma(closes15m, MA_PERIODS[2]) : null;
  const atr15m = highs15m && lows15m && closes15m ? atr(highs15m, lows15m, closes15m, ATR_PERIOD) : null;
  const volumeZ15m = volumes15m ? zScore(volumes15m, VOLUME_Z_LOOKBACK) : null;
  const structure15m = highs15m && lows15m ? structure(highs15m, lows15m, STRUCTURE_LOOKBACK) : null;

  const ma71h = closes1h ? sma(closes1h, MA_PERIODS[0]) : null;
  const ma251h = closes1h ? sma(closes1h, MA_PERIODS[1]) : null;
  const ma991h = closes1h ? sma(closes1h, MA_PERIODS[2]) : null;
  const atr1h = highs1h && lows1h && closes1h ? atr(highs1h, lows1h, closes1h, ATR_PERIOD) : null;
  const volumeZ1h = volumes1h ? zScore(volumes1h, VOLUME_Z_LOOKBACK) : null;
  const structure1h = highs1h && lows1h ? structure(highs1h, lows1h, STRUCTURE_LOOKBACK) : null;

  const ma74h = closes4h ? sma(closes4h, MA_PERIODS[0]) : null;
  const ma254h = closes4h ? sma(closes4h, MA_PERIODS[1]) : null;
  const ma994h = closes4h ? sma(closes4h, MA_PERIODS[2]) : null;
  const atr4h = highs4h && lows4h && closes4h ? atr(highs4h, lows4h, closes4h, ATR_PERIOD) : null;
  const volumeZ4h = volumes4h ? zScore(volumes4h, VOLUME_Z_LOOKBACK) : null;
  const structure4h = highs4h && lows4h ? structure(highs4h, lows4h, STRUCTURE_LOOKBACK) : null;

  const ma7Daily = closesDaily ? sma(closesDaily, MA_PERIODS[0]) : null;
  const ma25Daily = closesDaily ? sma(closesDaily, MA_PERIODS[1]) : null;
  const ma99Daily = closesDaily ? sma(closesDaily, MA_PERIODS[2]) : null;

  const pctFromMa7Daily = latestPrice !== null && ma7Daily !== null ? pctFrom(latestPrice, ma7Daily) : null;
  const pctFromMa25Daily = latestPrice !== null && ma25Daily !== null ? pctFrom(latestPrice, ma25Daily) : null;
  const pctFromMa99Daily = latestPrice !== null && ma99Daily !== null ? pctFrom(latestPrice, ma99Daily) : null;

  const atrDaily =
    highsDaily && lowsDaily && closesDaily ? atr(highsDaily, lowsDaily, closesDaily, ATR_PERIOD) : null;
  const volumeZDaily = volumesDaily ? zScore(volumesDaily, VOLUME_Z_LOOKBACK) : null;
  const structureDaily =
    highsDaily && lowsDaily ? structure(highsDaily, lowsDaily, STRUCTURE_LOOKBACK) : null;

  if (latestPrice === null) {
    // No price for this hour is a total failure for this asset — a snapshot
    // row requires a NOT NULL price (migration §2). Surface this loudly so
    // the caller can decide whether to skip the write for this asset.
    throw new Error(`snapshotBuilder: no daily klines for "${symbol}" — cannot derive price`);
  }

  const raw: Record<string, unknown> = {
    klinesByTf,
    funding,
    openInterest,
    longShortRatio,
    fearGreed,
    etfFlows,
  };

  const snapshot: MarketSnapshot = {
    assetId,
    ts: hourTs.toISOString(),
    price: latestPrice,

    marketCapUsd: null,
    volume24hUsd: volumesDaily ? volumesDaily[volumesDaily.length - 1] : null,

    rsi15m,
    rsi1h,
    rsi4h,
    rsi1d,

    ma715m,
    ma2515m,
    ma9915m,
    atr15m,
    volumeZ15m,
    structure15m,

    ma71h,
    ma251h,
    ma991h,
    atr1h,
    volumeZ1h,
    structure1h,

    ma74h,
    ma254h,
    ma994h,
    atr4h,
    volumeZ4h,
    structure4h,

    ma7Daily,
    ma25Daily,
    ma99Daily,
    pctFromMa7Daily,
    pctFromMa25Daily,
    pctFromMa99Daily,

    atrDaily,
    volumeZDaily,
    structureDaily,

    fundingRate: funding?.rate ?? null,
    fundingRateDelta24h: funding?.delta24h ?? null,
    openInterestUsd: openInterest?.openInterestUsd ?? null,
    openInterestChange24hPct: openInterest?.change24hPct ?? null,
    longShortRatio,
    // Liquidations require the !forceOrder@arr WebSocket stream (migration §5
    // comment) — no stateless hourly REST source exists, so this stays null.
    liquidations24hUsd: null,
    liquidationsDominantSide: null,

    etfNetFlowUsd: etfFlows?.lastDayUsd ?? null,
    etfStreakDays: etfFlows?.streakDays ?? null,
    etfFlow7dUsd: etfFlows?.sum7dUsd ?? null,
    fearGreed: fearGreed?.value ?? null,
    fearGreed7dAgo: fearGreed?.value7dAgo ?? null,

    raw,
  };

  return { snapshot, sources };
}
