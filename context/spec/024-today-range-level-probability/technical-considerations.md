# Technical Specification: Today Range & Level Probability

- **Functional Specification:** `./functional-spec.md` (read its §0 Gate first)
- **Status:** Draft, gated
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

A zero-drift lognormal model on **hourly** realized volatility, with a per-asset scalar
correction `k` fitted by backtest. The core is pure maths in one file. There is one read
endpoint, one table for daily scoring, and no LLM.

Why zero drift: direction is not claimed (functional §1). Any non-zero μ would be a
direction claim smuggled in through a parameter.

---

## 2. The Model (pure: `src/lib/todayRange.ts`)

All inputs are closed 1h candles from Binance (`fetchKlines`, interval `1h`).

### 2.1 Volatility

- `r_i = ln(close_i / close_{i-1})` over the last `TODAY_VOL_BARS` bars (default 168 = 7d).
- EWMA variance: `v = Σ w_i r_i²`, where `w_i ∝ λ^(age_i)` and weights are normalised.
  Default `λ = TODAY_EWMA_LAMBDA = 0.98` (half-life ≈ 34h). Mean assumed 0.
- `σ_h = k · √v` is the hourly σ. `k = TODAY_SIGMA_K[asset]`, default 1.0 until the Gate
  fits it.
- Horizon: `T` in hours (fractional), counted from the **live spot timestamp**.
  `σ_T = σ_h · √T`.

### 2.2 Outputs (S = live spot, Φ = standard normal CDF)

| Output | Formula |
|---|---|
| Quantile q | `S · exp(z_q · σ_T)`, z: p5 −1.645, p25 −0.674, p75 +0.674, p95 +1.645 |
| Close beyond L | `1 − Φ(|ln(L/S)| / σ_T)` |
| Touch L before T | `min(1, 2 · (1 − Φ(|ln(L/S)| / σ_T)))` (reflection principle, zero drift) |

- Continuous-monitoring touch slightly **overstates** hourly-sampled touches and
  understates fat-tail jumps. `k` and the Gate absorb this. Do not add ad-hoc fudge
  factors elsewhere.
- Constants live in `src/consts/today.ts` (README §4 rule 5): `TODAY_VOL_BARS`,
  `TODAY_EWMA_LAMBDA`, `TODAY_SIGMA_K`, `TODAY_MIN_BARS` (48), `TODAY_STALE_MINUTES` (120),
  `TODAY_MIN_HORIZON_HOURS` (1), `TODAY_MODEL_VERSION` (bump on any change to the maths,
  constants or `k`).
- Φ: implement once (Abramowitz–Stegun 7.1.26 or an erf approximation). Add unit tests
  against known values.

### 2.3 Horizon "Rest of day"

Computed **client-side** from the viewer's local midnight (`Intl` / `Date`), because the
server does not know the viewer's time zone. The server returns `σ_h`, spot and spot
timestamp. The client computes T, quantiles and probabilities with the **same** pure
functions imported from `src/lib/todayRange.ts`. There is one code path and no duplicate
maths.

---

## 3. API

`GET /api/today?asset=<coingecko id>`, cached `revalidate: 60`.

```ts
type TodayResponse =
  | { status: 'ok'; asset: string; spot: number; spotTs: string;
      sigmaHourly: number; k: number; modelVersion: number;
      lastBarTs: string; dayHighUtc: number; dayLowUtc: number;
      track: { n: number; held90: number; held50: number } | null }
  | { status: 'unavailable'; reason: 'klines_failed' | 'stale' | 'insufficient' | 'untracked';
      lastBarTs?: string };
```

- The spot price reuses the existing live-price path. If it is missing, return
  `unavailable`, never a fallback.
- Local-day high/low: the client derives these, or the server returns the last 24 bars'
  highs and lows with timestamps. Pick one and note the choice in the PR.
- The route **never** returns a number on failure (README §4 rule 1). Add a health check
  entry, as other sources have.
- Spec 023 context: klines from Binance failed in production (1d null) before functions
  moved to fra1. The route must surface a `klines_failed` reason from the spec-023
  failure-reason shape, not swallow it.

---

## 4. The Gate: backtest (`src/scripts/today-range-backtest.ts`)

It runs on **GitHub Actions `workflow_dispatch`** (`decisions.md` §10: agents cannot reach
Binance or Neon). Pure evaluation logic lives in `src/lib/todayRangeEval.ts` with tests,
and the script only does I/O.

- **Data:** `fetchKlinesRange` 1h for BTC, ETH, SOL, the last 730 days.
- **Origins:** every hour. Horizons: 24h, plus "rest of UTC day" (T = 1..24h).
- **For each origin:** σ from the preceding bars only (**no look-ahead**; assert it in a
  test). Then:
  - band coverage: is the realized close in [p25, p75] and in [p5, p95]?
  - for levels at ±0.5, 1, 2, 3, 5 % of spot: the predicted touch and close-beyond
    probabilities vs what realized highs/lows/close show.
- **Split:** fit `k` per asset on the first 70% of time, and evaluate **only** on the last
  30%.
- **Overlap:** hourly origins with a 24h horizon are autocorrelated. Report coverage with a
  block bootstrap (24h blocks), or additionally on non-overlapping daily origins.

### Pass criteria (out-of-sample, per asset)

| Check | Pass |
|---|---|
| 90% band coverage | 87–93% |
| 50% band coverage | 46–54% |
| Touch reliability, in decile buckets with n ≥ 100 | every bucket within ±5 pp |
| Close-beyond reliability, same buckets | every bucket within ±5 pp |

- **Output:** a markdown report (tables per asset) uploaded as a workflow artifact. Paste
  the verdict and key numbers into functional-spec §0.
- If `k` differs strongly by asset (e.g. SOL ≠ BTC), keep it per asset. Store the fitted
  values in `TODAY_SIGMA_K` and bump `TODAY_MODEL_VERSION`.

---

## 5. Daily Scoring (Slice 4)

Migration (next free number after `0010_accounts.sql`, check at implementation time):

```sql
CREATE TABLE today_range_predictions (
  id             bigserial PRIMARY KEY,
  asset_id       int NOT NULL REFERENCES assets(id),
  issued_at      timestamptz NOT NULL,      -- 00:00 UTC
  horizon_end    timestamptz NOT NULL,      -- +24h
  spot           numeric NOT NULL,
  sigma_hourly   numeric NOT NULL,
  k              numeric NOT NULL,
  model_version  int NOT NULL,
  p05 numeric NOT NULL, p25 numeric NOT NULL, p75 numeric NOT NULL, p95 numeric NOT NULL,
  realized_close numeric, realized_high numeric, realized_low numeric,
  in_band_50     boolean, in_band_90 boolean,
  resolved_at    timestamptz,
  UNIQUE (asset_id, issued_at)
);
```

- **Write:** the hourly `/api/collect` run issues the day's row once, for the first run
  with hour = 0 UTC. `ON CONFLICT DO NOTHING` makes this idempotent. If the 00 run is
  missed, the next run that day issues it with its **actual** `issued_at` and horizon.
  Never backdate.
- **Resolve:** any collect run after `horizon_end` fills the realized values from 1h klines.
- **Track record:** last 30 resolved rows for the **current** `model_version`. Rows from
  older versions are not mixed in.
- Neon CU budget: 3 inserts and 3 updates per day. Negligible.

---

## 6. UI

- New `src/components/panels/TodayPanel.tsx` with grid area `area-today` in
  `layout-default`. It takes the `coin` prop from `ProjectionsPage`. Add a `'today   ai'` row
  below `'chart   ai'` in the grid (the row the removed simulator used).
- Data hook `useToday(coinId)` polls every 60s. The level input is local state and resets
  to spot +1% on coin change.
- Probabilities are shown as integers (`38%`). Below 1% show "<1%", above 99% show ">99%".
  Never show "0%" or "100%", except touch = 100% when the level equals spot.
- Band colours are neutral violet/grey tokens, not green/red (functional §2.3).
- Field labels are in normal case, not caps-mono: uppercase turns σ into Σ.

---

## 7. Testing Strategy

`src/scripts/today-range.test.ts` (picked up by `npm test`):

- Φ against reference values. Quantile symmetry in log space.
- Touch = 1 at L = S, monotonic in |ln(L/S)|, and touch ≥ close-beyond everywhere.
- EWMA on a constant-return series. `insufficient` below `TODAY_MIN_BARS`.
- Stale detection at the `TODAY_STALE_MINUTES` boundary.
- Backtest evaluation: no look-ahead (σ at origin t uses bars < t only), and coverage
  arithmetic is checked on a hand-built series.
- Route: each `unavailable` reason returns no numeric fields.
