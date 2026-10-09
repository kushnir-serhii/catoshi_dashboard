import {
  PULSE_OI_FLUSH_PCT,
  PULSE_OI_FLUSH_SEVERITY_SPAN,
  PULSE_PRICE_FLUSH_PCT,
} from '@/consts/signals';

import { oiChange1hPct, priceChange1hPct } from '../gap';
import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'long_flush';

/** Open interest and price both fell over 1h: leveraged longs being closed out. Bearish. */
export const longFlush: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot, previous) {
    const oiPct = oiChange1hPct(snapshot, previous);
    const pricePct = priceChange1hPct(snapshot, previous);
    if (oiPct == null || pricePct == null) {
      return null;
    }
    if (oiPct > -PULSE_OI_FLUSH_PCT || pricePct > -PULSE_PRICE_FLUSH_PCT) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'BEARISH',
      title: 'Longs flushed out',
      body: `Open interest ${oiPct.toFixed(1)}% and price ${pricePct.toFixed(1)}% in 1h: longs being liquidated.`,
      source: 'Open interest',
      severity: severityFromDistance(-oiPct - PULSE_OI_FLUSH_PCT, PULSE_OI_FLUSH_SEVERITY_SPAN),
    };
  },
};
