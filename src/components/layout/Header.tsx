'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useDashboard } from '@/components/dashboard/context';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { NAV_ITEMS } from '@/consts/nav';

export const Header: React.FC = () => {
  const { glow } = useDashboard();
  const glowNorm = glow / 100;
  const pathname = usePathname();
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
        <Link href="/landing" className="brand" style={{ textDecoration: 'none' }}>
          <Cat variant="ears" size={28} glow={glowNorm} />
          <CatoshiWordmark size={16} />
        </Link>
        <nav className="nav mx-auto">
          {NAV_ITEMS.map((p) => (
            <Link
              key={p.key}
              href={`/${p.key}`}
              className={pathname === `/${p.key}` ? 'active' : ''}
            >
              {p.label}
              {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
            </Link>
          ))}
        </nav>
        {/* <<<============== Search input ==============>>> */}
        {/* <div className="search">
          <input placeholder="Search assets, models, signals…" />
          <button type="submit" className="active:scale-90">
            <SerchIcon width={20} height={20} />
          </button>
        </div> */}
        <button
          type="button"
          className={['burger', isMenuOpen && 'open'].filter(Boolean).join(' ')}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        {false && (
          <div className="balance">
            <div>
              <div className="lbl">BALANCE</div>
              <div className="val tnum">
                $248,392.41 <span className="delta">+5.26%</span>
              </div>
            </div>
            <div className="avatar">CT</div>
          </div>
        )}
      </header>

      {/* Mobile nav dropdown (hidden on desktop) */}
      <div className={['mobile-menu', isMenuOpen && 'open'].filter(Boolean).join(' ')}>
        <nav className="mobile-nav">
          {NAV_ITEMS.map((p) => (
            <Link
              key={p.key}
              href={`/${p.key}`}
              className={pathname === `/${p.key}` ? 'active' : ''}
            >
              {p.label}
              {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
};
