-- 0018_pulse_notifications.sql
-- Spec 027 (Market Pulse), Slice 7 — Telegram notifications (operator only).
--
-- One row per alert actually sent. Written by the notifier that runs after the
-- Pulse compute in /api/collect. The 24h dedupe reads it by joining `pulse_id`
-- to `market_pulse.computed_at` (the triggering point's time, not `sent_at`),
-- so the live dedupe matches the backtest.
--
--   * type       the alert type (confluence, conflict or reversal).
--   * pulse_id   the market_pulse row that triggered the alert.
--   * sent_at    wall-clock send time (audit only; not used for dedupe).
--   * validated  false under backtest Verdict B (message carried the
--                'Unvalidated' prefix), true under Verdict A.
--
-- Idempotent: `create ... if not exists`. House style follows 0017.

create table if not exists public.pulse_notifications (
  id          bigint      generated always as identity primary key,
  scope       text        not null,
  type        text        not null,
  pulse_id    bigint      not null references public.market_pulse (id),
  sent_at     timestamptz not null,
  validated   boolean     not null,

  constraint pulse_notifications_scope_check check (scope in ('market', 'BTC', 'ETH', 'SOL')),
  constraint pulse_notifications_type_check
    check (type in ('bear_confluence', 'bull_confluence', 'conflict', 'reversal'))
);

-- FK column index (join to market_pulse) and the dedupe lookup by scope and type.
create index if not exists pulse_notifications_pulse_idx
  on public.pulse_notifications (pulse_id);
create index if not exists pulse_notifications_dedupe_idx
  on public.pulse_notifications (scope, type, sent_at desc);

comment on table public.pulse_notifications is
  'Telegram alerts sent for the Market Pulse; the 24h dedupe source (spec 027, Slice 7).';
comment on column public.pulse_notifications.pulse_id is
  'The market_pulse row that triggered the alert; its computed_at is the dedupe time.';
comment on column public.pulse_notifications.validated is
  'false when sent under backtest Verdict B (message prefixed Unvalidated).';
