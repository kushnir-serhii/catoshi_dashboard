import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'bullish' | 'bearish' | 'high' | 'medium' | 'info';
export type BadgeSize = 'md' | 'sm';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-text-2',
  bullish: 'bg-green-soft text-green-2',
  bearish: 'bg-chart-bear/18 text-coral',
  high: 'bg-chart-bear/18 text-coral',
  medium: 'bg-amber/16 text-amber',
  info: 'border border-info/50 bg-info/18 text-info',
};

const SIZES: Record<BadgeSize, string> = {
  // `.signal .tag`
  md: 'px-2 py-1 text-xs tracking-(--ls-label)',
  // `.news-badge`
  sm: 'px-2 py-0.5 font-mono text-xs',
};

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  tone?: BadgeTone;
  size?: BadgeSize;
}

export function Badge({ tone = 'neutral', size = 'md', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn('rounded-pill inline-block', SIZES[size], TONES[tone], className)}
      {...rest}
    />
  );
}
