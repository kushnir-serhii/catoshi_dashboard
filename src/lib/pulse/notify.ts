import {
  PULSE_BACKTEST_N,
  PULSE_NOTIFY_ENV,
  PULSE_NOTIFY_HISTORY_HOURS,
  type PulseAlertType,
  TELEGRAM_STATUS_SOURCE,
} from '@/consts/pulse';
import type { PulseScope, SourceStatus } from '@/data/types';
import { insertPulseNotification, loadPulseHistory, loadSentAlerts } from '@/lib/db/pulse';

import { formatPulseAlert } from './message';
import {
  decideNotifications,
  type PulsePoint,
  pulsePointFromComputation,
  pulsePointFromStored,
  type SentAlert,
} from './notify-decision';
import type { FreshPulseByScope } from './run';
import { sendTelegramMessage } from './telegram';

const MS_PER_HOUR = 3_600_000;

export type NotifyConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      token: string;
      chatId: string;
      baseUrl: string;
      /** Only A or B send; C and unset are disabled. */
      verdict: 'A' | 'B';
    };

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Credentials and link base without the verdict gate (the test script bypasses the gate). */
export function readTelegramCredentials():
  | { ok: true; token: string; chatId: string; baseUrl: string | undefined }
  | { ok: false; reason: string } {
  const token = envValue(PULSE_NOTIFY_ENV.token);
  const chatId = envValue(PULSE_NOTIFY_ENV.chatId);
  if (token === undefined || chatId === undefined) {
    return { ok: false, reason: `missing ${PULSE_NOTIFY_ENV.token}/${PULSE_NOTIFY_ENV.chatId}` };
  }
  return { ok: true, token, chatId, baseUrl: envValue(PULSE_NOTIFY_ENV.baseUrl) };
}

/** Reads the notifier env; every "off" case carries its reason for the status note. */
export function readNotifyConfig(): NotifyConfig {
  const verdict = envValue(PULSE_NOTIFY_ENV.verdict);
  if (verdict !== 'A' && verdict !== 'B') {
    return {
      enabled: false,
      reason: verdict === undefined ? `${PULSE_NOTIFY_ENV.verdict} unset` : `verdict ${verdict}`,
    };
  }
  const credentials = readTelegramCredentials();
  if (!credentials.ok) return { enabled: false, reason: credentials.reason };
  if (credentials.baseUrl === undefined) {
    return { enabled: false, reason: `missing ${PULSE_NOTIFY_ENV.baseUrl}` };
  }
  return {
    enabled: true,
    token: credentials.token,
    chatId: credentials.chatId,
    baseUrl: credentials.baseUrl,
    verdict,
  };
}

/** Backtest sample count of a (scope, type); 0 until a backtest fills `PULSE_BACKTEST_N`. */
export function backtestN(scope: PulseScope, type: PulseAlertType): number {
  return PULSE_BACKTEST_N[scope]?.[type] ?? 0;
}

/**
 * Telegram step of the collect run (spec 027 technical §8). Runs after
 * `runPulse`. Disabled = no DB access and no network. Each decision is sent and
 * recorded independently: one failure never stops the others, and the whole step
 * reports a `telegram` SourceStatus.
 */
export async function runNotify(now: Date, fresh: FreshPulseByScope): Promise<SourceStatus> {
  const config = readNotifyConfig();
  if (!config.enabled) {
    return { source: TELEGRAM_STATUS_SOURCE, ok: true, note: `disabled: ${config.reason}` };
  }

  const currentPoints: PulsePoint[] = [];
  const pulseIdByScope = new Map<string, number>();
  for (const [scope, entry] of Object.entries(fresh)) {
    const point = pulsePointFromComputation(scope as PulseScope, now, entry.result);
    if (point === null) continue;
    currentPoints.push(point);
    pulseIdByScope.set(scope, entry.pulseId);
  }
  if (currentPoints.length === 0) {
    return { source: TELEGRAM_STATUS_SOURCE, ok: true, note: 'sent=0' };
  }

  const since = new Date(now.getTime() - PULSE_NOTIFY_HISTORY_HOURS * MS_PER_HOUR);
  const [stored, sentRows] = await Promise.all([loadPulseHistory(since), loadSentAlerts(since)]);
  // History from stored rows, but the point at `now` comes from the fresh compute
  // (stored rows carry no category counts).
  const history = stored
    .filter((row) => row.computedAt.getTime() < now.getTime())
    .map(pulsePointFromStored);
  const sent: SentAlert[] = sentRows.map((s) => ({
    scope: s.scope,
    type: s.type,
    sentAt: s.computedAt,
  }));

  const decisions = decideNotifications([...history, ...currentPoints], sent, now);

  let sentCount = 0;
  const errors: string[] = [];
  for (const decision of decisions) {
    const label = `${decision.scope}:${decision.type}`;
    try {
      const html = formatPulseAlert(
        decision,
        config.verdict,
        backtestN(decision.scope, decision.type),
        config.baseUrl,
      );
      await sendTelegramMessage(config.token, config.chatId, html);
      sentCount += 1;
      const pulseId = pulseIdByScope.get(decision.scope);
      if (pulseId === undefined) throw new Error('no stored pulse id');
      await insertPulseNotification({
        scope: decision.scope,
        type: decision.type,
        pulseId,
        sentAt: new Date(),
        validated: config.verdict === 'A',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pulse] telegram ${label} failed:`, message);
      errors.push(`${label}: ${message}`);
    }
  }

  if (errors.length > 0) {
    return {
      source: TELEGRAM_STATUS_SOURCE,
      ok: false,
      error: `${errors.join('; ')} (sent=${sentCount})`,
    };
  }
  return { source: TELEGRAM_STATUS_SOURCE, ok: true, note: `sent=${sentCount}` };
}
