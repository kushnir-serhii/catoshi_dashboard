import type { Metadata } from 'next';
import { MarketsPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Markets',
  description: 'Market overview, sector performance, and asset projections.',
};

export default function Page() {
  return <MarketsPage />;
}
