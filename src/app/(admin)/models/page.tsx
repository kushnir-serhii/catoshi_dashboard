import type { Metadata } from 'next';
import { ModelsPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Models',
  description: 'ML ensemble model accuracy, weights, and predictions.',
};

export default function Page() {
  return <ModelsPage />;
}
