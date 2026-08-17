import type { Metadata } from 'next';
import { SignalsPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Signals',
  description: 'On-chain, macro, sentiment, and technical trading signals.',
};

export default function Page() {
  return <SignalsPage />;
}
