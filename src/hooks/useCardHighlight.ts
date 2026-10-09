'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PULSE_HIGHLIGHT_MS } from '@/consts/pulse';

const HIGHLIGHT_CLASS = 'signal-highlight';

/**
 * Scroll to a signal card by `signal-<id>` and ring it for `PULSE_HIGHLIGHT_MS`.
 * `focusCard` only records the target; the scroll runs in an effect so it happens
 * after React has committed any reveal (expanded tail, reset news filter) the
 * caller set in the same event. A missing element (card expired since the Pulse
 * was computed) is a silent no-op.
 */
export function useCardHighlight(): (signalId: string) => void {
  // A fresh object per call so re-selecting the same id re-runs the effect.
  const [target, setTarget] = useState<{ id: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<HTMLElement | null>(null);

  const clearHighlight = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    elRef.current?.classList.remove(HIGHLIGHT_CLASS);
    elRef.current = null;
  }, []);

  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`signal-${target.id}`);
    if (!el) return;
    clearHighlight();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    el.classList.add(HIGHLIGHT_CLASS);
    elRef.current = el;
    timerRef.current = setTimeout(clearHighlight, PULSE_HIGHLIGHT_MS);
  }, [target, clearHighlight]);

  useEffect(() => clearHighlight, [clearHighlight]);

  return useCallback((signalId: string) => setTarget({ id: signalId }), []);
}
