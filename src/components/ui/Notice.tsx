import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type NoticeTone = 'neutral' | 'plain' | 'warning' | 'error' | 'selected';
export type NoticeLayout = 'block' | 'inline';
export type NoticePadding = 'sm' | 'md' | 'lg';

const TONES: Record<NoticeTone, { box: string; title: string; body: string }> = {
  // ModelsPage / SignalsPage "quiet"
  neutral: {
    box: 'border-surface-3 bg-surface-2',
    title: 'text-text',
    body: 'text-text-3',
  },
  // SignalsPanel empty/info strip
  plain: { box: 'border-line bg-surface', title: 'text-text', body: 'text-text-3' },
  warning: {
    box: 'border-notice-border bg-notice-bg text-notice',
    title: 'text-notice',
    body: 'text-notice',
  },
  error: {
    box: 'border-error-border bg-surface-2',
    title: 'text-red',
    body: 'text-text-3',
  },
  // ChartPanel selection / forecast-unavailable banner
  selected: {
    box: 'border-violet/35 bg-selected-softer text-violet-light',
    title: 'text-violet-light',
    body: 'text-violet-light',
  },
};

const BLOCK_PADDING: Record<NoticePadding, string> = {
  sm: 'px-4 py-5',
  md: 'px-5 py-8',
  lg: 'px-6 py-12',
};

export interface NoticeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  tone?: NoticeTone;
  /** `block` = centered card-like panel; `inline` = compact left-aligned strip with optional `action`. */
  layout?: NoticeLayout;
  /** Padding for `block` layout. */
  padding?: NoticePadding;
  title?: ReactNode;
  body?: ReactNode;
  /** Right-aligned control (inline layout), e.g. a retry button. */
  action?: ReactNode;
}

export function Notice({
  tone = 'neutral',
  layout = 'block',
  padding = 'md',
  title,
  body,
  action,
  className,
  children,
  ...rest
}: NoticeProps) {
  const t = TONES[tone];
  const role = tone === 'error' ? 'alert' : undefined;

  if (layout === 'inline') {
    return (
      <div
        role={role}
        className={cn(
          'flex items-center gap-3 rounded-sm border px-3 py-2 text-sm',
          t.box,
          className,
        )}
        {...rest}
      >
        <div className="min-w-0 flex-1">
          {title && <strong className={cn('mr-1 font-semibold', t.title)}>{title}</strong>}
          {body}
          {children}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div
      role={role}
      className={cn('rounded-lg border text-center', BLOCK_PADDING[padding], t.box, className)}
      {...rest}
    >
      {title && <h4 className={cn('mb-2 text-base', t.title)}>{title}</h4>}
      {body && (
        <p className={cn('mx-auto max-w-115 text-sm leading-(--lh-normal)', t.body)}>{body}</p>
      )}
      {children !== undefined && (
        <div className={cn('text-sm leading-(--lh-normal)', t.body)}>{children}</div>
      )}
    </div>
  );
}
