import { NewsSourceList } from '@/components/signals/NewsSourceList';
import type { NewsScope, NewsSignalItem } from '@/data/types';
import { formatSnapshotAge } from '@/lib/freshness';

function scopeBadgeLabel(scope: NewsScope): string {
  return scope === 'market' ? 'market-wide' : scope;
}

/**
 * A classified news headline (spec 015). Deliberately distinct from a rule card:
 * a "NEWS" pill and a blue accent, the source name, a scope badge, a magnitude
 * indicator, an outbound link to the article, and the article's own age.
 * One card per event cluster (spec 027): with 2+ sources every outlet is listed;
 * opinion pieces carry an "Opinion" badge.
 */
export function NewsCard({ n }: { n: NewsSignalItem }) {
  const tagClass = n.tag === 'BULLISH' ? 'bullish' : n.tag === 'BEARISH' ? 'bearish' : 'neutral';
  // Age is the ARTICLE's publication time — never classification or render time
  // (functional-spec 2.3, `decisions.md` §3 instance 2).
  const age = formatSnapshotAge(n.publishedAt) ?? 'recently';

  return (
    <div
      id={`signal-${n.id}`}
      className={`signal news ${tagClass}`}
      style={{ padding: 'var(--sp-4)' }}
    >
      <div className="head">
        <span className="news-pill">NEWS</span>
        <span className="tag">{n.tag}</span>
        <span className="src">{n.source}</span>
      </div>
      <div className="news-meta">
        <span className="news-badge">{scopeBadgeLabel(n.scope)}</span>
        <span className={`news-badge mag-${n.magnitude}`}>{n.magnitude} impact</span>
        {n.contentType === 'opinion' && <span className="news-badge">Opinion</span>}
      </div>
      <h4 style={{ fontSize: 'var(--fs-base)' }}>{n.title}</h4>
      {n.body && (
        <p
          className="small muted"
          style={{ margin: 'var(--sp-1) 0 var(--sp-2)', lineHeight: 'var(--lh-normal)' }}
        >
          {n.body}
        </p>
      )}
      <div className="foot" style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
        {n.sources.length > 1 ? (
          <NewsSourceList sources={n.sources} />
        ) : (
          <a
            className="news-link small"
            href={n.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read on {n.source} ↗
          </a>
        )}
        <span className="small muted">{age}</span>
      </div>
    </div>
  );
}
