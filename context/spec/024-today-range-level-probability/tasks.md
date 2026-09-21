# Tasks: Today Range & Level Probability

Slice 1 is a **gate**: it produces a verdict, not a feature. UI slices (3+) do not merge
before it. Every slice is done when its behaviour exists and is verified, not when it
compiles.

---

## Slice 0: Pure model

- [x] `src/consts/today.ts` with all constants from technical §2.2.
- [x] `src/lib/todayRange.ts`: `logReturns`, `ewmaSigmaHourly`, `normCdf`, `quantiles`,
      `touchProbability`, `closeBeyondProbability`, `hoursUntilLocalMidnight`. No I/O.
- [x] `src/scripts/today-range.test.ts`: the tests in technical §7 for pure maths.

**Done when:** `npm test` is green and the property tests (monotonic, touch ≥ close-beyond,
touch(S) = 1) pass.

## Slice 1: GATE: backtest

- [x] `src/lib/todayRangeEval.ts` (pure) + tests, including **no look-ahead**.
- [x] `src/scripts/today-range-backtest.ts`: 730d of 1h klines for BTC/ETH/SOL, a 70/30
      time split, `k` fitted on train, and the report on test.
- [x] A GitHub Actions `workflow_dispatch` job that runs it and uploads the report as an
      artifact (`decisions.md` §10).
- [ ] Record the verdict **A / B / C** with coverage and reliability numbers in
      functional-spec §0. Write the fitted `k` values into `TODAY_SIGMA_K` and bump
      `TODAY_MODEL_VERSION`.

| Verdict | Next |
|---|---|
| A | Slices 2–5 in full |
| B | Slices 2–5, but the level input is not built |
| C | **Stop.** Mark the spec rejected with the numbers |

## Slice 2: API

- [x] `GET /api/today` per technical §3, including every `unavailable` reason.
- [x] Health entry for the today source.
- [x] Tests: each failure reason returns no numeric fields. Untracked coin → `untracked`.

## Slice 3: UI card

- [x] `useToday` hook (60s poll) and `TodayPanel` in the `area-today` grid slot on
      Projections.
- [x] Horizon chips (Rest of day / Next 24h), with auto-fallback below 1h left.
- [x] Range band (50% / 90%) with neutral colours and a spot marker.
- [x] Level input + ±1/±2% chips, showing touch % and close-beyond % (Verdict A only).
- [x] Every failure state from functional §2.5. Footer disclaimer.
- [ ] Checked at 1440px and 375px.

## Slice 4: Daily scoring

- [x] Migration `today_range_predictions` (technical §5).
- [x] Issue a row from the collect run (idempotent, never backdated). Resolve rows after
      `horizon_end`.
- [x] Track-record line in the card, n ≥ 14, current `model_version` only.

## Slice 5: Verify

- [ ] Walk every acceptance criterion in functional §3.
- [ ] Rule-1 sweep: block Binance in dev and confirm no number renders anywhere on the card.
- [x] Add this spec to the `context/README.md` §3 register.
