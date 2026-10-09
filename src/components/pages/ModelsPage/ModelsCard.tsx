import type { ReactNode } from 'react';

import { Card, CardHeader, CardTitle } from '@/components/ui';

interface ModelsCardProps {
  title: string;
  children: ReactNode;
}

/** Titled card shell shared by every state of the Models page. */
export function ModelsCard({ title, children }: ModelsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle marker="violet">{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}
