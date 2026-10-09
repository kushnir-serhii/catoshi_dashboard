/**
 * Markdown for the Market Pulse backtest (spec 027 functional §2.8). Pure.
 * The numbers come from `src/lib/pulse/backtest.ts`; this file only formats them.
 */

import { PULSE_SCOPES } from '@/consts/pulse';
import type { PulseScope } from '@/data/types';

import type { BacktestCell, BacktestVerdict, BaseRate, ReplayDiagnostics } from './backtest';

export interface BacktestVariantReport {
  name: 'full' | 'market_state_only';
  label: string;
  diagnostics: ReplayDiagnostics;
  cells: BacktestCell[];
  /** Worst verdict over the primary (confluence) cells. */
  verdict: BacktestVerdict;
}

export interface BacktestReport {
  generatedAt: string;
  config: {
    days: number | null;
    windowStart: string;
    windowEnd: string;
    horizonHours: number;
    movePct: number;
    minAlerts: number;
    pMax: number;
    marketAsset: string;
  };
  baseRates: Record<PulseScope, BaseRate>;
  variants: BacktestVariantReport[];
  /** The full variant's verdict: the one recorded in functional §2.8. */
  overallVerdict: BacktestVerdict;
  /** Data notes discovered by the run (rule failures, kline source, …). */
  notes: string[];
}

function pct(x: number | null): string {
  return x === null ? '–' : `${(x * 100).toFixed(1)}%`;
}

function pval(x: number | null): string {
  if (x === null) return '–';
  return x < 0.001 ? '<0.001' : x.toFixed(3);
}

function baseRateTable(report: BacktestReport): string[] {
  const { horizonHours, movePct } = report.config;
  const lines = [
    `| Scope | Hours scored | Censored | Unpriced | ≥${movePct}% down in ${horizonHours}h | ≥${movePct}% up | Either way |`,
    '|---|---|---|---|---|---|---|',
  ];
  for (const scope of PULSE_SCOPES) {
    const b = report.baseRates[scope];
    const r = (k: number): string => (b.n > 0 ? pct(k / b.n) : '–');
    lines.push(
      `| ${scope} | ${b.n} | ${b.censored} | ${b.unpriced} | ${r(b.bear)} | ${r(b.bull)} | ${r(b.either)} |`,
    );
  }
  return lines;
}

function cellTable(cells: readonly BacktestCell[]): string[] {
  const lines = [
    '| Scope | Type | Role | Decided | Spaced out | Censored | n | Hits | False alarms | Hit rate | Base rate | p (one-sided) | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const c of cells) {
    lines.push(
      `| ${c.scope} | ${c.type} | ${c.primary ? 'primary' : 'info'} | ${c.decided} | ${c.spacedOut} | ${c.censored} | ${c.n} | ${c.hits} | ${c.falseAlarms} | ${pct(c.hitRate)} | ${pct(c.baseRate)} | ${pval(c.pValue)} | ${c.verdict} |`,
    );
  }
  return lines;
}

function diagnosticsLines(d: ReplayDiagnostics): string[] {
  const m = d.meanRowsPerHour;
  return [
    `- Hours replayed: ${d.hours}`,
    `- Mean rows per hour: market-state ${m.marketState.toFixed(1)}, macro ${m.macro.toFixed(1)}, news ${m.news.toFixed(1)} (with a content type: ${m.newsClassified.toFixed(1)})`,
    `- Hours with at least one news row that counts (content type set): ${d.hoursWithClassifiedNews}`,
    `- Pulse points ok / insufficient: ${PULSE_SCOPES.map((s) => `${s} ${d.okPoints[s]}/${d.insufficientPoints[s]}`).join(', ')}`,
  ];
}

export function renderBacktestReport(report: BacktestReport): string {
  const c = report.config;
  const out: string[] = [
    '# Market Pulse backtest (spec 027 §2.8)',
    '',
    `Generated ${report.generatedAt}. Window ${c.windowStart} → ${c.windowEnd}${c.days === null ? ' (all live-collected history)' : ` (last ${c.days} days)`}.`,
    '',
    `## Overall verdict: **${report.overallVerdict}**`,
    '',
    'Aggregation: the verdict is the most restrictive (C over B over A) across the',
    '**primary** cells, bear and bull confluence in every scope, of the **full** replay',
    '(market-state + macro + news). Notifications are switched by one global',
    '`PULSE_NOTIFY_VERDICT`, so a single failing confluence cell holds them all back.',
    'Conflict and reversal are reported for information and do not set the verdict.',
    '',
    `A: n ≥ ${c.minAlerts} and p < ${c.pMax}. B: n < ${c.minAlerts}. C: n ≥ ${c.minAlerts} and p ≥ ${c.pMax}.`,
    '',
    '## Conventions',
    '',
    `- Outcome: from the alert hour's stored close, a hit when any 1h close within the next ${c.horizonHours}h is ≥ ${c.movePct}% below (bear) / above (bull). Prices are live-collected \`snapshots.price\`; \`market\` uses ${c.marketAsset}.`,
    `- n counts alerts after the 24h dedupe, at least ${c.horizonHours}h after the previous kept alert of the same scope and type, with a complete outcome window. Alerts whose window runs past the data are **censored** and excluded; base-rate hours are censored by the same rule.`,
    '- Base rate: share of all replayed hours followed by the same-direction move (unconditional). p-value: exact one-sided binomial P(X ≥ hits | n, base rate).',
    '- Conflict has no direction: a hit is a move of the threshold either way, against the either-way base rate.',
    "- Reversal: the expected direction is the direction the Pulse value moved over 24h (falling = bearish). Alerts mix directions, so the p-value is the exact Poisson-binomial tail over each alert's own base rate; the base-rate column shows their mean.",
    '- No look-ahead: each hour sees only rows that existed then (rules re-run on the stored snapshot with 4h candles closed before the hour; news rows inserted, published and unexpired by then, with the newest classification created by then; macro readings whose day had ended). Collector statuses are passed empty: they only label missing categories and never change a value or an alert.',
    '',
    '## Base rates',
    '',
    ...baseRateTable(report),
    '',
  ];

  for (const v of report.variants) {
    out.push(`## ${v.label}: verdict **${v.verdict}**`, '', ...diagnosticsLines(v.diagnostics), '');
    out.push(...cellTable(v.cells), '');
  }

  if (report.notes.length > 0) {
    out.push('## Notes', '', ...report.notes.map((n) => `- ${n}`), '');
  }
  return out.join('\n');
}
