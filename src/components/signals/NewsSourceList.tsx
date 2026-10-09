import type { NewsSource } from '@/data/types';

/**
 * Every outlet that reported the same event (spec 027 functional 2.5.3), each
 * linked to its own article. Rendered only when a cluster has 2+ sources.
 */
export function NewsSourceList({ sources }: { sources: NewsSource[] }) {
  return (
    <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
      <span className="muted">Sources:</span>
      {sources.map((s) => (
        <a
          key={s.url}
          className="news-link"
          href={s.url}
          title={s.title}
          target="_blank"
          rel="noopener noreferrer"
        >
          {s.source} ↗
        </a>
      ))}
    </div>
  );
}
