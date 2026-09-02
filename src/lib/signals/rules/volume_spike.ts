import { VOLUME_SPIKE_SEVERITY_SPAN, VOLUME_SPIKE_Z } from '@/consts/signals';

import { severityFromDistance } from '../severity';
import type { RuleDefinition } from '../types';

const RULE_ID = 'volume_spike';

/**
 * Daily volume is two or more standard deviations above its trailing mean — the
 * move carries conviction rather than being low-liquidity drift. Directionless.
 */
export const volumeSpike: RuleDefinition = {
  ruleId: RULE_ID,
  run(snapshot) {
    const volumeZ = snapshot.volumeZDaily;
    if (volumeZ == null) {
      return null;
    }
    if (volumeZ < VOLUME_SPIKE_Z) {
      return null;
    }

    return {
      ruleId: RULE_ID,
      tag: 'NEUTRAL',
      title: 'Daily volume spike',
      body: `Daily volume ${volumeZ.toFixed(1)} sigma above normal — conviction behind the move, not drift.`,
      source: 'Volume',
      severity: severityFromDistance(volumeZ - VOLUME_SPIKE_Z, VOLUME_SPIKE_SEVERITY_SPAN),
    };
  },
};
