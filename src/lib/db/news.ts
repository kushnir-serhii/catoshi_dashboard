/**
 * Data-access for the news tables (spec 015). Slice 3 needs only the ingest
 * write; the classification and publish writes land in later slices.
 *
 * Honestly-erroring: a failed INSERT throws, and the caller (`/api/collect`)
 * catches it into a `SourceStatus` entry — a news failure never fails the run.
 */

import {
  NEWS_CLUSTER_WINDOW_HOURS,
  NEWS_MAGNITUDE_SEVERITY,
  NEWS_PROMPT_VERSION,
} from '@/consts/news';
import type { IngestedNewsItem } from '@/lib/collectors/newsFeed';
import { getPool, query } from '@/lib/db/client';
import { type ClusterCandidate, findClusterId } from '@/lib/news/cluster';

export interface PersistNewsResult {
  /** Rows actually inserted (a duplicate `url_hash` is a no-op). */
  inserted: number;
}

/**
 * Recent stored items a new batch may cluster with: everything published within
 * the cluster window before the oldest incoming item. Legacy rows with a NULL
 * `cluster_id` count as their own cluster (`coalesce(cluster_id, id)`).
 */
export const NEWS_CLUSTER_CANDIDATES_SQL = `select id, coalesce(cluster_id, id) as cluster_id, title, published_at
   from public.news_items
   where published_at >= $1::timestamptz - make_interval(hours => $2)
   order by published_at`;

/**
 * Inserts each ingested article, skipping any whose canonical URL is already
 * stored (`ON CONFLICT (url_hash) DO NOTHING`). Ingest is idempotent by
 * construction: running collection twice inserts each article once.
 *
 * Each new row also gets its duplicate-cluster key (spec 027 5.3): the
 * `cluster_id` of a similar recent item if `findClusterId` finds one,
 * otherwise its own id. The own-id case needs the generated id, so it is a
 * follow-up `update` after the insert (only for rows that start a cluster);
 * items inserted earlier in this same batch are candidates for later ones.
 */
export async function persistNewsItems(
  items: readonly IngestedNewsItem[],
): Promise<PersistNewsResult> {
  let inserted = 0;
  if (items.length === 0) return { inserted };

  const oldest = items.reduce(
    (min, i) => (i.publishedAt < min ? i.publishedAt : min),
    items[0].publishedAt,
  );
  const stored = await query<{
    id: string;
    cluster_id: string;
    title: string;
    published_at: Date;
  }>(NEWS_CLUSTER_CANDIDATES_SQL, [oldest, NEWS_CLUSTER_WINDOW_HOURS]);
  const candidates: ClusterCandidate[] = stored.map((r) => ({
    id: Number(r.id),
    clusterId: Number(r.cluster_id),
    title: r.title,
    publishedAt: new Date(r.published_at),
  }));

  for (const item of items) {
    const publishedAt = new Date(item.publishedAt);
    const clusterId = findClusterId(item.title, publishedAt, candidates);
    const rows = await query<{ id: string }>(
      `insert into public.news_items
         (url_hash, url, title, source, feed_url, published_at, raw, cluster_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (url_hash) do nothing
       returning id`,
      [
        item.urlHash,
        item.url,
        item.title,
        item.source,
        item.feedUrl,
        item.publishedAt,
        JSON.stringify(item.raw),
        clusterId,
      ],
    );
    if (rows.length === 0) continue;
    inserted += rows.length;

    const id = Number(rows[0].id);
    if (clusterId === null) {
      await query('update public.news_items set cluster_id = id where id = $1', [id]);
    }
    candidates.push({ id, clusterId: clusterId ?? id, title: item.title, publishedAt });
  }

  return { inserted };
}

/**
 * One classification row to insert (spec 015, Slice 4). Field names are
 * camelCase; the SQL below maps them to the `news_classifications` columns.
 *
 * `costUsd` is the FULL batch call cost (one LLM call classifies up to
 * `NEWS_CLASSIFY_BATCH_SIZE` items) written on every row from that batch — the
 * same documented over-count caveat as `persistForecasts`: summing `cost_usd`
 * across rows from one batch multiplies by the batch size; the batch's true
 * cost is the value on any single row.
 */
export interface ClassificationInsert {
  newsItemId: number;
  /** `'market'` or a tracked `assets.symbol`. */
  scope: string;
  /** Resolved `assets.id` for an asset scope; `null` for `'market'`. */
  assetId: number | null;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  magnitude: 'LOW' | 'MEDIUM' | 'HIGH';
  horizonHours: number;
  /** Classifier verdict; `null` when the model omitted or mis-stated it. */
  contentType: 'event' | 'opinion' | null;
  confidence: number;
  rationale: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

/**
 * Insert statement for one classification row. `on conflict do nothing` on the
 * `(news_item_id, prompt_version)` unique index: a given prompt version grades
 * an item exactly once, and a BUMPED `prompt_version` inserts a fresh row
 * rather than overwriting the prior assertion (functional-spec 2.4). Exported
 * so the test can assert the conflict target without a database.
 */
export const NEWS_CLASSIFICATION_INSERT_SQL = `insert into public.news_classifications
     (news_item_id, scope, asset_id, direction, magnitude, horizon_hours,
      confidence, rationale, model, prompt_version, input_tokens, output_tokens, cost_usd,
      content_type)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
   on conflict (news_item_id, prompt_version) do nothing`;

/**
 * Persists one batch's classification results in a single transaction:
 *   1. insert every valid classification row (`inserts`);
 *   2. stamp `news_items.classified_at = now()` for every item that reached a
 *      terminal decision this batch (`terminalItemIds` — classified OR validly
 *      dropped, so a dropped item is never retried forever).
 *
 * Either both happen or neither does. An item lost to an API failure is not in
 * `terminalItemIds`, so it stays `classified_at IS NULL` and is retried.
 *
 * Throws on any DB error (the caller catches it into a `SourceStatus` and
 * writes nothing else — no `classified_at`, no placeholder row).
 */
export async function persistClassifications(
  inserts: readonly ClassificationInsert[],
  terminalItemIds: readonly number[],
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('begin');

    for (const row of inserts) {
      await client.query(NEWS_CLASSIFICATION_INSERT_SQL, [
        row.newsItemId,
        row.scope,
        row.assetId,
        row.direction,
        row.magnitude,
        row.horizonHours,
        row.confidence,
        row.rationale,
        row.model,
        row.promptVersion,
        row.inputTokens,
        row.outputTokens,
        row.costUsd,
        row.contentType,
      ]);
    }

    if (terminalItemIds.length > 0) {
      await client.query(
        'update public.news_items set classified_at = now() where id = any($1::bigint[])',
        [terminalItemIds],
      );
    }

    await client.query('commit');
  } catch (error: unknown) {
    await client.query('rollback');
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    client.release();
  }
}

/**
 * Publishes classified headlines into `public.signals` as `kind = 'news'` rows
 * (spec 015, Slice 5). One INSERT…SELECT…ON CONFLICT DO NOTHING, idempotent on
 * the partial unique index `signals_news_item_uniq (news_item_id) where
 * kind = 'news'` — publish runs every collection.
 *
 *   - `tag`        = classification direction (already the signals CHECK vocab)
 *   - `title`      = the headline (`news_items.title`)
 *   - `body`       = the classifier's one-sentence rationale
 *   - `source`     = the news source name (`news_items.source`)
 *   - `source_url` = the article URL (`news_items.url`)
 *   - `severity`   = fixed point from the magnitude → severity map
 *   - `expires_at` = `published_at + horizon_hours` — computed from the
 *     ARTICLE's publication time in SQL, never `classified_at`, never `now()`
 *   - `asset_id`   = the classification's asset (NULL for market scope)
 *   - `rule_id` / `snapshot_ts` / `since_ts` = NULL (allowed for news kind)
 *
 * Only classifications under the CURRENT `NEWS_PROMPT_VERSION` are published: a
 * later prompt bump re-classifies (new `news_classifications` row) and its
 * output supersedes here on the next run, while the partial unique index still
 * guarantees exactly one live signal per item.
 *
 * Returns the number of signal rows actually inserted this call. Throws on any
 * DB error (the caller catches it into a `SourceStatus`).
 */
export async function publishNewsSignals(): Promise<{ published: number }> {
  const rows = await query<{ id: string }>(
    `insert into public.signals
       (kind, asset_id, tag, title, body, source, source_url, severity, expires_at, news_item_id)
     select 'news',
            nc.asset_id,
            nc.direction,
            ni.title,
            nc.rationale,
            ni.source,
            ni.url,
            case nc.magnitude
              when 'LOW'    then $1::real
              when 'MEDIUM' then $2::real
              when 'HIGH'   then $3::real
            end,
            ni.published_at + make_interval(hours => nc.horizon_hours),
            nc.news_item_id
       from public.news_classifications nc
       join public.news_items ni on ni.id = nc.news_item_id
      where nc.prompt_version = $4
        and not exists (
          select 1 from public.signals s
           where s.kind = 'news' and s.news_item_id = nc.news_item_id
        )
     on conflict (news_item_id) where kind = 'news' do nothing
     returning id`,
    [
      NEWS_MAGNITUDE_SEVERITY.LOW,
      NEWS_MAGNITUDE_SEVERITY.MEDIUM,
      NEWS_MAGNITUDE_SEVERITY.HIGH,
      NEWS_PROMPT_VERSION,
    ],
  );
  return { published: rows.length };
}
