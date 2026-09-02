# Tasks: Forecast Scoring and the Models Explorer

Ordered so the dishonest page dies first and the measurement is built behind it. Slice 1
ships alone and is the single most valuable change in the spec.

---

## Slice 1 — Delete the fabricated Models page

`src/data/models.ts` claims 74% ensemble accuracy for six models that do not exist. It
needs no database work to remove, and every hour it stays is an hour the product lies
about its own skill.

- [ ] Delete `src/data/models.ts`.
- [ ] Rewrite `ModelsPage.tsx` to render an explicit "no resolved forecasts yet" state — the truthful state until Slice 4 has run for a while (technical-considerations §6).
- [ ] Remove `Model`, `Prediction` and any other now-unused types from `src/data/types.ts` if nothing else imports them.
- [ ] Confirm nothing else imports `@/data/models` (`ModelsPage.tsx` is the only known consumer).
- [ ] `npx tsc --noEmit` clean.

**Done when:** the Models page states it has nothing measured yet, and no invented number remains anywhere in the app.

---

## Slice 2 — Somewhere to put a score

- [ ] `db/migrations/0005_outcome_scores.sql`: add `outcomes.brier_score double precision` plus the 0..2 check constraint (§4). Idempotent, `public.` prefix, named constraint, matching `0001` house style.
- [ ] Apply: `node --env-file=.env.local scripts/migrate.mjs`.
- [ ] Confirm the column and constraint exist.

**Blocks:** slices 3–5.

---

## Slice 3 — The scoring maths, as pure functions

No database, no network — this is arithmetic, and it is where a silent wrong answer would
hide longest.

- [ ] `src/lib/scoring/brier.ts`: multi-category Brier over `{bull, base, bear}`, returning 0..2.
- [ ] `src/lib/scoring/realizedScenario.ts`: the midpoint-partition rule from §3. Sorts the three predicted prices rather than assuming bull > base > bear. Returns `null` (unscoreable) when they are not distinct.
- [ ] `src/consts/scoring.ts`: horizons scored, the no-skill baseline (0.667), the snapshot age limit, and the minimum sample size below which the page reports insufficient data.
- [ ] Decide and document the sparse-horizon behaviour — nearest available day, or skip (§8.3). Not left implicit.
- [ ] `src/scripts/scoring.test.ts`, following the `signal-rules.test.ts` pattern: Brier at 0 / 0.667 / 2; one case per scenario band; both boundary-exact cases resolving to base; degenerate curves unscoreable; unsorted curves still partitioned correctly; probabilities not summing to 100 handled deliberately (§7).
- [ ] The test exits non-zero on failure and runs with `npx tsx`.

**Done when:** the scoring test passes with no database and no network.

---

## Slice 4 — Resolving forecasts

- [ ] Snapshot age limit on the forecast → snapshot link: link only within the limit, otherwise record the forecast with `snapshot_id = null` (functional-spec 2.6, roadmap §5.2).
- [ ] `src/lib/scoring/resolve.ts`: find forecasts whose `as_of + horizon_days` has elapsed and have no outcome for that `(forecast_id, horizon_days)`; look up the actual price at the horizon; write the outcome with `entry_price` taken from the **market** at `as_of`, not `forecasts.anchor_price` (§3).
- [ ] Write `brier_score`, or leave it null for unscoreable outcomes — never zero (functional-spec 2.3).
- [ ] Call resolution from `/api/collect` **after** snapshots commit; catch per-forecast failures; surface through `SourceStatus`; never fail the run (§5, functional-spec 2.9).
- [ ] Verify idempotency: run the same hour twice, confirm no duplicate outcomes and no changed scores.
- [ ] Verify a forecast whose horizon has not elapsed is left alone.
- [ ] Confirm `forecasts.cost_usd` is actually populated from `FORECAST_MODEL_PRICING` — the constant exists, the wiring is unverified (§1.5).

---

## Slice 5 — Reading the scores

- [ ] A calibration view (or single query module) grouping by `model` and `prompt_version`, with the exclusions in one place: back-filled snapshots out (functional-spec 2.5), `snapshot_id is null` out (2.6), unscoreable outcomes out.
- [ ] The view reports the count behind every aggregate, and the number excluded.
- [ ] `/api/models` (or equivalent) reading it. No computation in the route.
- [ ] `ModelsPage.tsx`: mean score per model and prompt version, **always beside the 0.667 baseline** (functional-spec 2.8), the trend over time, the sample count, and the exclusions.
- [ ] Below the minimum sample size, the page shows the insufficient-data state rather than a number (2.7).
- [ ] Verify by hand: empty outcomes, a handful of outcomes, and enough to report.

**Done when:** every number on the Models page traces to a resolved forecast.

---

## Slice 6 — Correct the record

- [ ] **`analytics-automation-spec.md` §7 says a Brier score below 0.25 beats a coin flip. That is the binary-form baseline and is wrong for this system** — three categories put the no-skill baseline at 0.667 (§3). Correct it; left as is, it would mark a genuinely skilled forecaster as failing.
- [ ] `context/product/architecture.md` and `CLAUDE.md`: describe the scoring pipeline; remove any reference to `src/data/models.ts`.
- [ ] Note in the roadmap that spec 012 is now falsifiable, and that spec 014's thresholds became measurable.
- [ ] Record the realized-scenario rule where a future reader will find it — changing it later invalidates every stored score (§8.2).

---

## Deliberately not in any slice

- Automatic prompt rewriting from scores — the weekly review is a human reading numbers.
- Re-calibrating spec 014's rule thresholds.
- Back-filling outcomes for forecasts made before this ships.
- Scoring spec 014's signals — they state present facts, not predictions.
- A model leaderboard or automatic model selection.
