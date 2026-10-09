import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

type Dimension = 'width' | 'height';

function useContainerDimension<T extends HTMLElement>(
  dimension: Dimension,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize(entry.contentRect[dimension]);
    });
    observer.observe(el);
    setSize(el.getBoundingClientRect()[dimension]);
    return () => observer.disconnect();
  }, [dimension]);

  return [ref, size];
}

/** Container width measurement (for horizontal-scroll sizing). */
export function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  return useContainerDimension<T>('width');
}

/** Mirrors `useContainerWidth` but for height — used so the chart can size
 * itself to whatever height its wrapper is given at the current breakpoint
 * (e.g. shrunk on mobile) instead of a fixed constant. */
export function useContainerHeight<T extends HTMLElement>(): [RefObject<T | null>, number] {
  return useContainerDimension<T>('height');
}
