import Link from 'next/link';

import { LANDING_ADVICE_NOTE, LANDING_APP_HREF } from '@/consts/landing';

import { Showcase } from './Showcase';

const HERO_META = ['No sign-up', 'Nothing to connect', 'BTC · ETH · SOL'];

export function Hero({ glow }: { glow: number }) {
  return (
    <section className="hero">
      <div className="eyebrow">
        <span className="dot"></span>
        Forecasting and signals for BTC · ETH · SOL
      </div>
      <h1>
        Crypto projections,
        <br />
        with the math that <span className="neon-violet">matters</span>{' '}
        <span className="neon-green">most.</span>
      </h1>
      <p className="lede">
        Catoshi snapshots the market every hour, turns each snapshot into bull / base / bear
        scenarios with a single language-model call, and scores every forecast against the price
        that actually printed.
      </p>
      <p className="lede -mt-4.5 text-sm">
        <em>{LANDING_ADVICE_NOTE}</em>
      </p>
      <div className="hero-cta">
        <Link href={LANDING_APP_HREF} className="btn-cta">
          Open the dashboard →
        </Link>
        <a href="#how" className="btn-cta-ghost">
          See how it works
        </a>
      </div>
      <div className="hero-meta">
        {HERO_META.map((m) => (
          <span key={m}>
            <span className="ok">●</span> {m}
          </span>
        ))}
      </div>
      <Showcase glow={glow} />
    </section>
  );
}
