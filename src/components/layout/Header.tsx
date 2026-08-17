'use client';

import Link from 'next/link';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { useDashboard } from '@/components/dashboard/context';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/consts/nav';
import SerchIcon from '@/assets/icons/header/search-md.svg';

export const Header: React.FC = () => {
  const { glow } = useDashboard();
  const glowNorm = glow / 100;
  const pathname = usePathname();

  return (
    <>
      <header className="topbar justify-between">
        <Link href="/landing" className="brand" style={{ textDecoration: 'none' }}>
          <Cat variant="ears" size={28} glow={glowNorm} />
          <CatoshiWordmark size={16} />
        </Link>
        <nav className="nav">
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
        <div className="search">
          <input placeholder="Search assets, models, signals…" />
          <button type="submit" className="active:scale-90">
            <SerchIcon width={20} height={20} />
          </button>
        </div>
        <div className="balance">
          <div>
            <div className="lbl">BALANCE</div>
            <div className="val tnum">
              $248,392.41 <span className="delta">+5.26%</span>
            </div>
          </div>
          <div className="avatar">CT</div>
        </div>
      </header>

      {/* Mobile nav strip (hidden on desktop) */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map((p) => (
          <Link key={p.key} href={`/${p.key}`} className={pathname === `/${p.key}` ? 'active' : ''}>
            {p.label}
            {'isNew' in p && p.isNew && <span className="pill-new">NEW</span>}
          </Link>
        ))}
      </nav>
    </>
  );
};
