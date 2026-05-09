import type { Metadata } from 'next';
import { CryptoDashboard } from '@/components/dashboard/CryptoDashboard';

export const metadata: Metadata = {
  title: 'Catoshi — Crypto Projections',
  description: 'AI-powered crypto portfolio projections and scenario analysis',
};

export default function Page() {
  return <CryptoDashboard />;
}
