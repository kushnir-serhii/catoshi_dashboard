import Link from 'next/link';

import { Badge } from '@/components/ui';
import { cn } from '@/utils/cn';

export type NavLinkVariant = 'desktop' | 'mobile';

interface NavLinkProps {
  href: string;
  label: string;
  isActive: boolean;
  isNew?: boolean;
  variant: NavLinkVariant;
}

const BASE = 'text-sm no-underline hover:text-text';

const VARIANTS: Record<NavLinkVariant, { idle: string; active: string; pill: string }> = {
  // `.nav a`
  desktop: {
    idle: 'inline-flex items-center gap-2 rounded px-3 py-2 text-text-2 transition-[color,background] duration-(--dur-fast) ease-in-out hover:bg-surface-2 motion-reduce:transition-none',
    active:
      'inline-flex items-center gap-2 rounded bg-surface-2 px-3 py-2 text-text transition-[color,background] duration-(--dur-fast) ease-in-out motion-reduce:transition-none',
    pill: 'px-2',
  },
  // `.mobile-nav a`
  mobile: {
    idle: 'rounded border border-transparent px-3 py-3 text-text-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center',
    active:
      'rounded border border-line bg-surface-2 px-3 py-3 text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center',
    pill: 'ml-1 px-1',
  },
};

export const NavLink: React.FC<NavLinkProps> = ({ href, label, isActive, isNew, variant }) => {
  const styles = VARIANTS[variant];
  return (
    <Link href={href} className={cn(BASE, isActive ? styles.active : styles.idle)}>
      {label}
      {isNew && (
        <Badge
          tone="bullish"
          size="sm"
          className={cn('font-sans tracking-(--ls-label)', styles.pill)}
        >
          NEW
        </Badge>
      )}
    </Link>
  );
};
