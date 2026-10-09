import type { ReactNode } from 'react';

import { Muted } from '@/components/ui';

interface ModalSectionProps {
  /** Uppercase label above the section body. */
  label: ReactNode;
  children: ReactNode;
}

/** Labelled block inside a dashboard modal. */
export function ModalSection({ label, children }: ModalSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <Muted className="leading-(--lh-normal) tracking-(--ls-label) uppercase" size="xs">
        {label}
      </Muted>
      {children}
    </div>
  );
}
