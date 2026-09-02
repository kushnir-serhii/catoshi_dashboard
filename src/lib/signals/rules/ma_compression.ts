import { MA_COMPRESSION_PCT } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'ma_compression';

/**
 * The 4h MA7 and MA25 have converged to within a small percentage of each other
 * — a squeeze that volatility expansion tends to follow. The 4h timeframe is
 * chosen deliberately (forecast-journal miss #4). Directionless.
 */
export const maCompression: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const ma7 = snapshot.ma74h;
    const ma25 = snapshot.ma254h;
    if (ma7 == null || ma25 == null) {
      return null;
    }
    if (ma25 === 0) {
      return null;
    }

    const spreadPct = (Math.abs(ma7 - ma25) / Math.abs(ma25)) * 100;
    if (spreadPct > MA_COMPRESSION_PCT) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'NEUTRAL',
      title: '4h moving averages compressing',
      body: `4h MA7 and MA25 within ${spreadPct.toFixed(2)}% — volatility expansion often follows a squeeze.`,
      source: 'MA 4h',
      // Tighter spread = stronger signal, so severity grows as spread shrinks.
      severity: severityFromDistance(MA_COMPRESSION_PCT - spreadPct, MA_COMPRESSION_PCT),
    };
  },
};
