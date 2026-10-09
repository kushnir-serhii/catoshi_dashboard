import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/utils/cn';

import type { MarkerColor } from './Marker';
import { Marker } from './Marker';

export interface CardTitleProps extends ComponentPropsWithoutRef<'div'> {
  /** Renders a glowing dot before the title in this colour. Omit for none. */
  marker?: MarkerColor;
}

export function CardTitle({ marker, className, children, ...rest }: CardTitleProps) {
  return (
    <div
      className={cn(
        'text-text-3 flex items-center gap-2 text-xs tracking-(--ls-label) uppercase',
        className,
      )}
      {...rest}
    >
      {marker && <Marker color={marker} />}
      {children}
    </div>
  );
}
