'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useDashboard } from '@/components/dashboard/context';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { NAV_ITEMS } from '@/consts/nav';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/utils/cn';

import { AccountControl } from './AccountControl';
import { BurgerButton } from './BurgerButton';
import { NavLink, type NavLinkVariant } from './NavLink';

export const Header: React.FC = () => {
  const { glow } = useDashboard();
  const glowNorm = glow / 100;
  const pathname = usePathname();
  const { session } = useSession();

  // `adminOnly` entries (spec 022 §2.8) are hidden unless the session role is admin.
  const navItems = NAV_ITEMS.filter(
    (p) => !('adminOnly' in p && p.adminOnly) || session?.role === 'admin',
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown whenever the route changes.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const renderLinks = (variant: NavLinkVariant) =>
    navItems.map((p) => (
      <NavLink
        key={p.key}
        href={p.href}
        label={p.label}
        isActive={pathname === p.href}
        isNew={'isNew' in p && Boolean(p.isNew)}
        variant={variant}
      />
    ));

  return (
    <div ref={menuRef}>
      <header className="border-line bg-surface flex items-center justify-between gap-4 rounded-lg border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] px-4 py-3 backdrop-blur-sm max-[1024px]:flex-nowrap max-[1024px]:gap-3 max-[768px]:gap-2 max-[768px]:px-3 max-[768px]:py-2 max-[390px]:px-2">
        <a
          href="#main-content"
          className="bg-surface-3 text-text absolute top-0 -left-2499.75 z-(--z-skip-link) rounded px-4 py-3 text-sm no-underline focus-visible:top-3 focus-visible:left-3 focus-visible:rounded-sm"
        >
          Skip to main content
        </a>
        <Link
          href="/landing"
          className="border-line flex cursor-pointer items-center gap-2 border-r pr-4 no-underline max-[640px]:pr-2 pointer-coarse:min-h-11"
        >
          <Cat variant="ears" size={28} glow={glowNorm} />
          <CatoshiWordmark size={16} />
        </Link>
        <nav className="mx-auto flex gap-1 max-[1024px]:hidden">{renderLinks('desktop')}</nav>
        <AccountControl />
        <BurgerButton isOpen={isMenuOpen} onToggle={() => setIsMenuOpen((v) => !v)} />
      </header>

      {/* Mobile nav dropdown (hidden on desktop, animated open/close). `visibility` keeps the
          collapsed links out of the tab order and a11y tree; its delay lets the collapse play. */}
      <div
        id="mobile-menu"
        className={cn(
          'hidden max-[1024px]:invisible max-[1024px]:block max-[1024px]:max-h-0 max-[1024px]:-translate-y-1.5 max-[1024px]:overflow-hidden max-[1024px]:opacity-0',
          'motion-reduce:transition-none max-[1024px]:[transition:max-height_var(--dur-slow)_ease,opacity_var(--dur-base)_ease,transform_var(--dur-base)_ease,margin-top_var(--dur-slow)_ease,visibility_0s_linear_var(--dur-slow)]',
          isMenuOpen &&
            'max-[1024px]:visible max-[1024px]:mt-3 max-[1024px]:max-h-120 max-[1024px]:translate-y-0 max-[1024px]:opacity-100 max-[1024px]:[transition-delay:0s]',
        )}
      >
        <nav className="border-line bg-surface flex flex-col gap-0.5 rounded-lg border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-2 backdrop-blur-sm max-[640px]:px-0 max-[640px]:pb-0">
          {renderLinks('mobile')}
        </nav>
      </div>
    </div>
  );
};
