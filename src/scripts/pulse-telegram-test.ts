/**
 * Spec 027 Slice 7: sends ONE sample Telegram message built from the latest stored
 * `market` Pulse row, with the real formatter, token, chat id and link.
 *
 *   npm run pulse-telegram-test                 # send one sample message
 *   npm run pulse-telegram-test -- --dry-run    # print the HTML, send nothing
 *
 * Bypasses the `PULSE_NOTIFY_VERDICT` gate (that gate is for collect runs). It
 * never writes to `pulse_notifications`. Under the gate-bypass the sample uses the
 * Verdict B format so the 'Unvalidated' prefix is visible. Reads `market_pulse`
 * only (needs DATABASE_URL).
 */

import { PULSE_NOTIFY_ENV } from '@/consts/pulse';
import { loadLatestPulse } from '@/lib/db/pulse';
import { formatPulseAlert } from '@/lib/pulse/message';
import { backtestN, readTelegramCredentials } from '@/lib/pulse/notify';
import { type PulseAlertDecision, pulsePointFromStored } from '@/lib/pulse/notify-decision';
import { sendTelegramMessage } from '@/lib/pulse/telegram';

const DRY_RUN_BASE_URL = 'http://localhost:3000';

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');

  const credentials = readTelegramCredentials();
  if (!dryRun && !credentials.ok) {
    console.error(`Cannot send: ${credentials.reason}. Set them in .env.local (or use --dry-run).`);
    return 1;
  }
  const baseUrl = credentials.ok ? credentials.baseUrl : undefined;
  if (!dryRun && baseUrl === undefined) {
    console.error(
      `Cannot send: missing ${PULSE_NOTIFY_ENV.baseUrl} (needed for the /signals link).`,
    );
    return 1;
  }

  const row = await loadLatestPulse('market');
  if (row === null) {
    console.error('No stored market Pulse row yet.');
    return 1;
  }

  const point = pulsePointFromStored(row);
  const type = row.value < 0 ? 'bear_confluence' : 'bull_confluence';
  const decision: PulseAlertDecision = {
    scope: 'market',
    type,
    point,
    reason: `Test message from the latest stored row (${row.computedAt.toISOString()}), not a real alert`,
  };
  const html = formatPulseAlert(
    decision,
    'B',
    backtestN('market', type),
    baseUrl ?? DRY_RUN_BASE_URL,
  );

  if (dryRun) {
    console.log(html);
    return 0;
  }
  if (!credentials.ok) return 1;
  await sendTelegramMessage(credentials.token, credentials.chatId, html);
  console.log('Sent 1 test message.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
