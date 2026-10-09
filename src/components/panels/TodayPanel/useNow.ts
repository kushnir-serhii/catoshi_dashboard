import { useEffect, useState } from 'react';

import { TODAY_CLOCK_TICK_MS } from '@/consts/today';

/** Re-reads the clock on an interval so "updated Ns ago" and the time left stay current. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TODAY_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
