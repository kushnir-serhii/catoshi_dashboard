/**
 * Read-path cluster collapse (spec 027 technical 5.3 / functional 2.5.3).
 *
 * Items about the same event share `news_items.cluster_id`. The feed shows ONE
 * entry per cluster listing every source. Pure — no I/O — so the API and the
 * unit test run the same code.
 *
 * Representative rule: highest `severity`, then most recent `published_at`,
 * then highest `id`. The entry takes the representative's own id, title, body,
 * tag, scope, magnitude and publishedAt. `sources` lists EVERY member (the
 * representative included), oldest first, so the original reporter leads.
 * Entry order follows the input order at the cluster's first row, so an input
 * sorted newest-first stays newest-first.
 *
 * Legacy rows have `cluster_id = NULL` and count as their own cluster.
 */

import type { NewsScope, NewsSignalItem } from '@/data/types';

export interface NewsSignalRow {
  id: string;
  /** `coalesce(news_items.cluster_id, news_items.id)` — never null. */
  cluster_id: string;
  tag: NewsSignalItem['tag'];
  title: string;
  body: string;
  source: string;
  source_url: string;
  published_at: string | Date;
  expires_at: string | Date;
  severity: number;
  scope: string;
  magnitude: NewsSignalItem['magnitude'];
  horizon_hours: number;
  confidence: number;
  /** NULL for classifications written under an older prompt version. */
  content_type: NewsSignalItem['contentType'] | null;
}

function ms(value: string | Date): number {
  return new Date(value).getTime();
}

/** True when `a` should represent a cluster instead of `b`. */
function outranks(a: NewsSignalRow, b: NewsSignalRow): boolean {
  if (a.severity !== b.severity) return a.severity > b.severity;
  if (ms(a.published_at) !== ms(b.published_at)) return ms(a.published_at) > ms(b.published_at);
  return BigInt(a.id) > BigInt(b.id);
}

export function collapseClusters(rows: readonly NewsSignalRow[]): NewsSignalItem[] {
  const groups = new Map<string, NewsSignalRow[]>();
  for (const row of rows) {
    const group = groups.get(row.cluster_id);
    if (group) group.push(row);
    else groups.set(row.cluster_id, [row]);
  }

  return [...groups.values()].map((members) => {
    const rep = members.reduce((best, row) => (outranks(row, best) ? row : best));
    const sources = [...members]
      .sort((a, b) => ms(a.published_at) - ms(b.published_at))
      .map((m) => ({
        source: m.source,
        url: m.source_url,
        title: m.title,
        publishedAt: new Date(m.published_at).toISOString(),
      }));
    return {
      id: rep.id,
      kind: 'news' as const,
      tag: rep.tag,
      title: rep.title,
      body: rep.body,
      source: rep.source,
      sourceUrl: rep.source_url,
      sources,
      contentType: rep.content_type ?? null,
      publishedAt: new Date(rep.published_at).toISOString(),
      expiresAt: new Date(rep.expires_at).toISOString(),
      scope: rep.scope as NewsScope,
      magnitude: rep.magnitude,
      severity: rep.severity,
      horizonHours: rep.horizon_hours,
      confidence: rep.confidence,
    };
  });
}
