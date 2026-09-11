'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';

import { useDashboard } from '@/components/dashboard/context';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { NAV_ITEMS } from '@/consts/nav';
import { formatUtcTime } from '@/hooks/useProjections';
import { useSession } from '@/hooks/useSession';

const SignInButton: React.FC<{ callbackUrl: string }> = ({ callbackUrl }) => (
  <button
    type="button"
    className="btn btn-ghost"
    onClick={() => {
      void signIn('google', { callbackUrl });
    }}
  >
    Continue with Google
  </button>
);

const AccountMenu: React.FC<{
  name: string | null;
  email: string | null;
  remaining: number | null;
  resetsAt: string | null;
}> = ({ name, email, remaining, resetsAt }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="account-menu" style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {name ?? email ?? 'Account'}
      </button>
      {open && (
        <div
          role="menu"
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 220,
            padding: 'var(--sp-3)',
            zIndex: 'var(--z-dropdown)',
          }}
        >
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{name ?? 'Signed in'}</div>
          {email && (
            <div
              className="text-muted"
              style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}
            >
              {email}
            </div>
          )}
          {remaining !== null && (
            <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-2)' }}>
              {remaining} left today
              {resetsAt ? ` · resets ${formatUtcTime(resetsAt)}` : ''}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 'var(--sp-3)', width: '100%' }}
            onClick={() => {
              void signOut({ callbackUrl: '/' });
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

const AccountControl: React.FC = () => {
  const pathname = usePathname();
  const { session, isLoading } = useSession();

  if (isLoading) return null;

  if (!session || session.role === 'guest') {
    return <SignInButton callbackUrl={pathname || '/'} />;
  }

  return (
    <AccountMenu
      name={session.name}
      email={session.email}
      remaining={session.remaining}
      resetsAt={session.resetsAt}
    />
  );
};

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

  return (
    <div ref={menuRef}>
      <header className="topbar justify-between">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Link href="/landing" className="brand" style={{ textDecoration: 'none' }}>
          <Cat variant="ears" size={28} glow={glowNorm} />
          <CatoshiWordmark size={16} />
        </Link>
        <nav className="nav mx-auto">
          {navItems.map((p) => (
            <Link key={p.key} href={p.href} className={pathname === p.href ? 'active' : ''}>
              {p.label}
              {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
            </Link>
          ))}
        </nav>
        <AccountControl />
        <button
          type="button"
          className={['burger', isMenuOpen && 'open'].filter(Boolean).join(' ')}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          onClick={() => setIsMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* Mobile nav dropdown (hidden on desktop) */}
      <div
        id="mobile-menu"
        className={['mobile-menu', isMenuOpen && 'open'].filter(Boolean).join(' ')}
      >
        <nav className="mobile-nav">
          {navItems.map((p) => (
            <Link key={p.key} href={p.href} className={pathname === p.href ? 'active' : ''}>
              {p.label}
              {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
};
