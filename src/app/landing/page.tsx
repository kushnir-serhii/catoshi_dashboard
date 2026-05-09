import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Catoshi — Crypto Projections with the Math that Matters',
  description: 'AI-powered crypto portfolio projections. Bull, base, and bear scenarios from an ensemble of 5 ML models — refreshed every 4 hours.',
};

export default function Page() {
  return <LandingPage />;
}
