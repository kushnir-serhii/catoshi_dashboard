import Link from 'next/link';

import { FredAttribution } from '@/components/layout';
import { Cat, CatoshiWordmark } from '@/components/ui/CatLogo';
import { Muted } from '@/components/ui/Muted';
import { LANDING_LOGO_VARIANT } from '@/consts/landing';

const DASHBOARD_LINKS = [
  { href: '/projections', label: 'Projections' },
  { href: '/signals', label: 'Signals' },
  { href: '/models', label: 'Models' },
];

export function LandingFooter({ glow }: { glow: number }) {
  return (
    <footer className="footer">
      <div className="shrink-0 grow-0 basis-60">
        <div className="mb-4 flex items-center gap-2">
          <Cat variant={LANDING_LOGO_VARIANT} size={26} glow={glow} />
          <CatoshiWordmark size={16} />
        </div>
        <Muted as="p" className="m-0">
          Forecasting and signals that show their work.
        </Muted>
      </div>
      <div className="col">
        <h5>Dashboard</h5>
        {DASHBOARD_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        <a href="#faq">FAQ</a>
      </div>
      <div className="copy">
        © 2026 Catoshi · Crypto involves risk. Projections are statistical, not guaranteed. Not
        financial advice.
      </div>
      <FredAttribution />
    </footer>
  );
}
