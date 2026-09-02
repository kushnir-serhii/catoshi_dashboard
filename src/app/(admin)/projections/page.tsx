import type { Metadata } from 'next';

import { ProjectionsPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Projections',
  description: 'AI-generated price projections with bull, base, and bear scenarios.',
};

export default function Page() {
  return <ProjectionsPage />;
}
