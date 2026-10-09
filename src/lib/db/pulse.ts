import type { PulseAlertType } from '@/consts/pulse';
import type { PulseScope } from '@/data/types';
import { query } from '@/lib/db/client';
import { queryLiveMarketStateRows, queryLiveNewsRows } from '@/lib/db/signals-live';
import type {
  PulseAsset,
  PulseCollectorStatus,
  PulseDriverRecord,
  PulseInputRow,
} from '@/lib/pulse/compute';

/**
 * Persistence and loaders for the Market Pulse (spec 027 Slice 4).
 * Live-row liveness is NOT re-implemented here: the loader reuses the same
 * queries `/api/signals` runs (`src/lib/db/signals-live.ts`).
 */

const MS_PER_HOUR = 3_600_000;

/** A `market_pulse` driver as stored: `c` plus the card reference (technical §3). */
export interface StoredPulseDriver {
  signal_id: string;
  label: string;
  display: string;
  c: number;
}

export interface PulseRow {
  scope: PulseScope;
  computedAt: Date;
  bull: number;
  bear: number;
  value: number;
  conflict: boolean;
  inputCount: number;
  drivers: StoredPulseDriver[];
  missing: string[];
  modelVersion: number;
}

interface PulseDbRow {
  scope: PulseScope;
  computed_at: Date;
  bull: number;
  bear: number;
  value: number;
  conflict: boolean;
  input_count: number;
  drivers: StoredPulseDriver[];
  missing: string[];
  model_version: number;
}

const PULSE_COLUMNS =
  'scope, computed_at, bull, bear, value, conflict, input_count, drivers, missing, model_version';

function asAsset(symbol: string | null): PulseAsset | null {
  return symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL' ? symbol : null;
}

/**
 * Every live signal row as a Pulse input; scope filtering is `computePulse`'s job.
 * Liveness is evaluated by the DB clock inside the shared queries, so `scope` and
 * `now` only document the call site and keep the signature stable.
 */
export async function loadPulseInputs(_scope: PulseScope, _now: Date): Promise<PulseInputRow[]> {
  const [stateRows, newsRows] = await Promise.all([
    queryLiveMarketStateRows(null),
    queryLiveNewsRows(false, null),
  ]);

  const inputs: PulseInputRow[] = [];
  for (const row of stateRows) {
    const base = {
      id: row.id,
      asset: asAsset(row.symbol),
      tag: row.tag,
      severity: row.severity,
      title: row.title,
      body: row.body,
      ruleId: row.rule_id,
    };
    inputs.push(
      row.kind === 'macro'
        ? { ...base, kind: 'macro', observedAt: row.since_ts }
        : { ...base, kind: 'market_state' },
    );
  }
  for (const row of newsRows) {
    inputs.push({
      kind: 'news',
      id: row.id,
      asset: asAsset(row.scope),
      tag: row.tag,
      severity: row.severity,
      title: row.title,
      body: row.body,
      magnitude: row.magnitude,
      horizonHours: row.horizon_hours,
      contentType: row.content_type,
      clusterId: row.cluster_id,
      publishedAt: row.published_at,
    });
  }
  return inputs;
}

/** Last outcome per collector source; `ok` = the last attempt had no error. */
export async function loadCollectorStatuses(): Promise<PulseCollectorStatus[]> {
  const rows = await query<{ source: string; last_error: string | null }>(
    'select source, last_error from public.collector_status',
  );
  return rows.map((row) => ({ source: row.source, ok: row.last_error === null }));
}

function toPulseRow(row: PulseDbRow): PulseRow {
  return {
    scope: row.scope,
    computedAt: new Date(row.computed_at),
    bull: row.bull,
    bear: row.bear,
    value: row.value,
    conflict: row.conflict,
    inputCount: row.input_count,
    drivers: row.drivers,
    missing: row.missing,
    modelVersion: row.model_version,
  };
}

/**
 * Upserts on (scope, computed_at): re-running the same hour overwrites.
 * Returns the row's `id` (the notifier links `pulse_notifications` to it).
 */
export async function insertPulse(row: PulseRow): Promise<number> {
  const rows = await query<{ id: string | number }>(
    `insert into public.market_pulse
       (scope, computed_at, bull, bear, value, conflict, input_count, drivers, missing, model_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::text[], $10)
     on conflict (scope, computed_at) do update set
       bull = excluded.bull,
       bear = excluded.bear,
       value = excluded.value,
       conflict = excluded.conflict,
       input_count = excluded.input_count,
       drivers = excluded.drivers,
       missing = excluded.missing,
       model_version = excluded.model_version
     returning id`,
    [
      row.scope,
      row.computedAt,
      row.bull,
      row.bear,
      row.value,
      row.conflict,
      row.inputCount,
      JSON.stringify(row.drivers),
      row.missing,
      row.modelVersion,
    ],
  );
  return Number(rows[0].id);
}

/** Stored driver shape from a computed driver record. */
export function toStoredDriver(driver: PulseDriverRecord): StoredPulseDriver {
  return {
    signal_id: driver.signalId,
    label: driver.label,
    display: driver.display,
    c: driver.c,
  };
}

export async function loadLatestPulse(scope: PulseScope): Promise<PulseRow | null> {
  const rows = await query<PulseDbRow>(
    `select ${PULSE_COLUMNS} from public.market_pulse
      where scope = $1 order by computed_at desc limit 1`,
    [scope],
  );
  return rows[0] ? toPulseRow(rows[0]) : null;
}

/**
 * The stored row closest to `ts` within `toleranceHours` (either side), or null.
 * Used for the 1h / 6h / 24h deltas.
 */
export async function loadPulseNear(
  scope: PulseScope,
  ts: Date,
  toleranceHours: number,
): Promise<PulseRow | null> {
  const lo = new Date(ts.getTime() - toleranceHours * MS_PER_HOUR);
  const hi = new Date(ts.getTime() + toleranceHours * MS_PER_HOUR);
  const rows = await query<PulseDbRow>(
    `select ${PULSE_COLUMNS} from public.market_pulse
      where scope = $1 and computed_at between $2 and $3
      order by abs(extract(epoch from (computed_at - $4::timestamptz))) asc
      limit 1`,
    [scope, lo, hi, ts],
  );
  return rows[0] ? toPulseRow(rows[0]) : null;
}

/** Last attempt of the `pulse:<scope>` collector entry, with its note (`detail`). */
export interface PulseAttemptStatus {
  lastAttemptAt: Date;
  detail: string | null;
}

export async function loadPulseAttemptStatus(
  scope: PulseScope,
): Promise<PulseAttemptStatus | null> {
  const rows = await query<{ last_attempt_at: Date | null; detail: string | null }>(
    'select last_attempt_at, detail from public.collector_status where source = $1',
    [`pulse:${scope}`],
  );
  const row = rows[0];
  if (!row || !row.last_attempt_at) return null;
  return { lastAttemptAt: new Date(row.last_attempt_at), detail: row.detail };
}

/** Stored rows of every scope computed at or after `since`, ascending (notifier lookback). */
export async function loadPulseHistory(since: Date): Promise<PulseRow[]> {
  const rows = await query<PulseDbRow>(
    `select ${PULSE_COLUMNS} from public.market_pulse
      where computed_at >= $1 order by computed_at asc`,
    [since],
  );
  return rows.map(toPulseRow);
}

/** An alert already sent, with the time of the Pulse point that triggered it. */
export interface SentPulseAlert {
  scope: PulseScope;
  type: PulseAlertType;
  /** `market_pulse.computed_at` of the triggering row, NOT `pulse_notifications.sent_at`. */
  computedAt: Date;
}

/**
 * Alerts sent for points computed at or after `since`. Joined to
 * `market_pulse.computed_at` so the dedupe matches the backtest (see `SentAlert`).
 */
export async function loadSentAlerts(since: Date): Promise<SentPulseAlert[]> {
  const rows = await query<{ scope: PulseScope; type: PulseAlertType; computed_at: Date }>(
    `select n.scope, n.type, p.computed_at
       from public.pulse_notifications n
       join public.market_pulse p on p.id = n.pulse_id
      where p.computed_at >= $1`,
    [since],
  );
  return rows.map((r) => ({ scope: r.scope, type: r.type, computedAt: new Date(r.computed_at) }));
}

export interface NewPulseNotification {
  scope: PulseScope;
  type: PulseAlertType;
  pulseId: number;
  sentAt: Date;
  validated: boolean;
}

export async function insertPulseNotification(n: NewPulseNotification): Promise<void> {
  await query(
    `insert into public.pulse_notifications (scope, type, pulse_id, sent_at, validated)
     values ($1, $2, $3, $4, $5)`,
    [n.scope, n.type, n.pulseId, n.sentAt, n.validated],
  );
}
