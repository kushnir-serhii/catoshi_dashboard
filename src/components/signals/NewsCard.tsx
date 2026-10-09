import { NewsSourceList } from '@/components/signals/NewsSourceList';
import { Badge, type BadgeTone, Muted } from '@/components/ui';
import type { NewsScope, NewsSignalItem } from '@/data/types';
import { formatSnapshotAge } from '@/lib/freshness';
import { cn } from '@/utils/cn';

function scopeBadgeLabel(scope: NewsScope): string {
  return scope === 'market' ? 'market-wide' : scope;
}

const TAG_TONES: Record<NewsSignalItem['tag'], BadgeTone> = {
  BULLISH: 'bullish',
  BEARISH: 'bearish',
  NEUTRAL: 'neutral',
};

const MAGNITUDE_TONES: Record<NewsSignalItem['magnitude'], BadgeTone> = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'neutral',
};

/**
 * A classified news headline (spec 015). Deliberately distinct from a rule card:
 * a "NEWS" pill and a blue accent, the source name, a scope badge, a magnitude
 * indicator, an outbound link to the article, and the article's own age.
 * One card per event cluster (spec 027): with 2+ sources every outlet is listed;
 * opinion pieces carry an "Opinion" badge.
 */
export function NewsCard({ n }: { n: NewsSignalItem }) {
  const tagTone = TAG_TONES[n.tag];
  // Age is the ARTICLE's publication time — never classification or render time
  // (functional-spec 2.3, `decisions.md` §3 instance 2).
  const age = formatSnapshotAge(n.publishedAt) ?? 'recently';

  return (
    // `signal` stays as the hook for the Pulse jump highlight (`.signal.signal-highlight`).
    <div
      id={`signal-${n.id}`}
      className={cn(
        'signal relative flex cursor-default flex-col gap-2 overflow-hidden rounded-lg border border-[oklch(0.6_0.13_265/0.5)] bg-[linear-gradient(180deg,oklch(0.6_0.13_265/0.06),var(--color-surface)_60%)] p-4',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:content-[""]',
        tagTone === 'bullish' && 'after:shadow-[inset_0_1px_0_rgba(110,255,163,0.12)]',
        tagTone === 'bearish' && 'after:shadow-[inset_0_1px_0_rgba(255,110,110,0.12)]',
      )}
    >
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Badge size="sm" tone="info" className="border-0 py-1 tracking-(--ls-label)">
          NEWS
        </Badge>
        <Badge tone={tagTone}>{n.tag}</Badge>
        <span className="text-text-3 ml-auto font-mono text-sm">{n.source}</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge size="sm">{scopeBadgeLabel(n.scope)}</Badge>
        <Badge size="sm" tone={MAGNITUDE_TONES[n.magnitude]}>
          {n.magnitude} impact
        </Badge>
        {n.contentType === 'opinion' && <Badge size="sm">Opinion</Badge>}
      </div>
      <h4 className="m-0 text-base leading-(--lh-snug) font-medium">{n.title}</h4>
      {n.body && (
        <Muted as="p" className="mt-1 mb-2">
          {n.body}
        </Muted>
      )}
      <div className="text-text-3 flex flex-wrap justify-between gap-2 font-mono text-sm">
        {n.sources.length > 1 ? (
          <NewsSourceList sources={n.sources} />
        ) : (
          <a
            className="text-info text-sm leading-(--lh-normal) no-underline hover:underline"
            href={n.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read on {n.source} ↗
          </a>
        )}
        <Muted>{age}</Muted>
      </div>
    </div>
  );
}
