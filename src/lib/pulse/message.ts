import {
  PULSE_ALERT_MESSAGE_DRIVERS,
  PULSE_ZONE_THRESHOLD,
  type PulseNotifyVerdict,
} from '@/consts/pulse';

import type { PulseAlertDecision } from './notify-decision';

const TYPE_TITLE: Record<PulseAlertDecision['type'], string> = {
  bear_confluence: '🔴 Bearish confluence',
  bull_confluence: '🟢 Bullish confluence',
  conflict: '⚖️ Conflict',
  reversal: '🔄 Reversal',
};

/** Escapes the three characters Telegram HTML mode treats as markup. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Signed number with a real minus sign. */
function formatSigned(v: number): string {
  const r = Math.round(v);
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '0';
}

/** Same zone rule as the Pulse bar. */
function zoneLabel(v: number): string {
  if (v > PULSE_ZONE_THRESHOLD) return 'Bullish';
  if (v < -PULSE_ZONE_THRESHOLD) return 'Bearish';
  return 'Range';
}

/** Trailing slashes off the base URL so the link has exactly one. */
function signalsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/signals`;
}

/**
 * Telegram HTML for one alert (functional §2.7: bar value, drivers, link to
 * `/signals`). Pure. Under Verdict B the first line is
 * "Unvalidated (backtest n = <n>)".
 */
export function formatPulseAlert(
  decision: PulseAlertDecision,
  verdict: PulseNotifyVerdict,
  backtestN: number,
  baseUrl: string,
): string {
  const { point } = decision;
  const lines: string[] = [];
  if (verdict === 'B') lines.push(`<i>Unvalidated (backtest n = ${backtestN})</i>`);

  lines.push(`<b>${TYPE_TITLE[decision.type]}</b> · ${escapeTelegramHtml(decision.scope)}`);
  lines.push(
    `Pulse ${formatSigned(point.value)} (${zoneLabel(point.value)}) · bull ${point.bull} / bear ${point.bear}${point.conflict ? ' · Conflict' : ''}`,
  );

  const drivers = point.drivers.slice(0, PULSE_ALERT_MESSAGE_DRIVERS);
  if (drivers.length > 0) {
    lines.push('Drivers:');
    for (const d of drivers) {
      lines.push(`• ${escapeTelegramHtml(d.label)} · ${escapeTelegramHtml(d.display)}`);
    }
  }

  lines.push(escapeTelegramHtml(decision.reason));
  lines.push(`<a href="${escapeTelegramHtml(signalsUrl(baseUrl))}">Open Signals</a>`);
  return lines.join('\n');
}
