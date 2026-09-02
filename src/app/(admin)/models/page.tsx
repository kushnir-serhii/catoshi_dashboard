import type { Metadata } from 'next';

import { ModelsPage } from '@/components/pages';

export const metadata: Metadata = {
  title: 'Catoshi — Models',
  description:
    'Measured forecast accuracy: mean Brier score per model and prompt version, against the no-skill baseline.',
};

export default function Page() {
  return <ModelsPage />;
}
