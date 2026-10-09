import type { ReactNode } from 'react';

import { Card, CardHeader, CardTitle } from '@/components/ui';

/** Titled admin card: marker + title header over arbitrary content. */
export function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle marker="violet">{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}
