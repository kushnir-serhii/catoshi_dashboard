import Link from 'next/link';

import { LANDING_ADVICE_NOTE, LANDING_APP_HREF } from '@/consts/landing';

export function FinalCta() {
  return (
    <section className="section">
      <div className="final-cta">
        <h2>See the current projections.</h2>
        <p>Open the dashboard — no sign-up, nothing to connect. {LANDING_ADVICE_NOTE}</p>
        <div className="hero-cta">
          <Link href={LANDING_APP_HREF} className="btn-cta">
            Open the dashboard →
          </Link>
          <a href="#faq" className="btn-cta-ghost">
            Read the FAQ
          </a>
        </div>
      </div>
    </section>
  );
}
