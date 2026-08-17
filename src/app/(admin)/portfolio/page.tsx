import type { Metadata } from 'next';
import { PortfolioPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Portfolio',
  description: 'Track positions, P&L, allocation drift, and recent transactions.',
};

export default function Page() {
  return <PortfolioPage />;
}
