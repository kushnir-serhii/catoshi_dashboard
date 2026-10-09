import Link from 'next/link';

import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { LANDING_APP_HREF, LANDING_LOGO_VARIANT } from '@/consts/landing';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

export function LandingNav({ glow }: { glow: number }) {
  return (
    <nav className="land-nav">
      <div className="brand-flex">
        <Cat variant={LANDING_LOGO_VARIANT} size={26} glow={glow} />
        <CatoshiWordmark size={16} />
      </div>
      <div className="land-nav-links">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </div>
      <div className="land-nav-cta">
        <Link href={LANDING_APP_HREF} className="btn-cta px-4 py-3 text-sm">
          Open dashboard →
        </Link>
      </div>
    </nav>
  );
}
