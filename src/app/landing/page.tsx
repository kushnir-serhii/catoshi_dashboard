import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Catoshi — Crypto Projections with the Math that Matters',
  description:
    'Hourly market-state snapshots for BTC, ETH and SOL turned into bull, base and bear scenarios by a single language-model call, then scored against the real price. Not financial advice.',
};

export default function Page() {
  return <LandingPage />;
}
