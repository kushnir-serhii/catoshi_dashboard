# Tasks: Forecast Accuracy by Horizon

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Technical Specification:** [technical-considerations.md](./technical-considerations.md)

> **Verification note:** the `playwright` browser MCP was not connected when this list was
> written, so the visual checks in Slices 3–5 (colours, layout, 375px) are confirmed by the
> user spot-checking `/models`. Applying `0012` to the live Neon database needs explicit user
> approval at that step.

---

- [x] **Slice 1: Database view + pure horizon-breakdown helper (verifiable, no visible change yet)**
  - [x] Write migration `db/migrations/0012_calibration_by_horizon.sql` creating `public.calibration_scores_by_horizon` (`create or replace view`, grouped by `model, prompt_version, horizon_days`, same `exclusion_reason is null` filter as `calibration_scores`). **[Agent: general-purpose]**
  - [x] Apply the migration to Neon (`scripts/migrate.mjs` against `DATABASE_URL_UNPOOLED`, or Neon MCP `run_sql`) — ask the user for approval first. **[Agent: general-purpose]**
  - [x] Run the manual SQL checks: `select distinct horizon_days from calibration_base` returns only 1/7/30, and for every `(model, prompt_version)` `sum(scored_count)` from the new view equals `calibration_scores.scored_count`. **[Agent: general-purpose]**
  - [x] Write `src/lib/scoring/horizonBreakdown.ts` (`buildHorizonBreakdown`, `HorizonEntry`, `horizonLabel`, `formatHorizonCounts`), reusing `SCORED_HORIZON_DAYS`, `MIN_SCORED_SAMPLE_SIZE`, `NO_SKILL_BRIER_BASELINE` from `src/consts/scoring.ts`. **[Agent: nextjs-fullstack]**
  - [x] Add unit cases to `src/scripts/scoring.test.ts`: fixed 1/7/30 order and empty input, zero-fill and stray-horizon drop, threshold at 29/30 and `meanBrier: null`, beating/below + delta, the 94/12 example, exact `formatHorizonCounts` string, counts add up. **[Agent: nextjs-fullstack]**
  - [x] Verify: `npx tsx src/scripts/scoring.test.ts` passes. **[Agent: nextjs-fullstack]**

- [x] **Slice 2: `byHorizon` on `/api/models` (verifiable via curl, no UI change)**
  - [x] Add `ModelHorizonScore` and `byHorizon: ModelHorizonScore[]` on `ModelCalibrationGroup` in `src/data/types.ts`. **[Agent: nextjs-fullstack]**
  - [x] Add the `by_horizon` correlated `json_agg` subquery (ordered by `horizon_days`) to `GROUPS_QUERY` in `src/app/api/models/route.ts`, and map `by_horizon` → `byHorizon`. **[Agent: nextjs-fullstack]**
  - [x] Verify: `npm run dev`, `curl localhost:3000/api/models`, each group has a `byHorizon` array (sparse rows). **[Agent: nextjs-fullstack]**
  - [x] Verify: `npx tsc --noEmit` and `npm run lint` pass. **[Agent: nextjs-fullstack]**

- [x] **Slice 3: "By horizon" row on a scored card**
  - [x] In `GroupCard` (`src/components/pages/ModelsPage.tsx`), add the "By horizon" block between "Based on N scored outcomes" and the trend block using `buildHorizonBreakdown(group.byHorizon)`: `scored` entries show label, `meanBrier.toFixed(3)`, Beating/Below + delta in `var(--green)`/`var(--red)`, and "N scored"; `insufficient` entries show label + "N scored · not enough yet" muted, no number. **[Agent: nextjs-fullstack]**
  - [x] Lay the three entries out in a `flexWrap: 'wrap'` flex container with a `var(--sp-*)` gap and a min-width `flex` basis per entry. **[Agent: nextjs-fullstack]**
  - [ ] Verify: `npm run dev`, open `/models`; order is 1 day / 7 days / 30 days, colours match the overall score, and header, overall score, baseline, count, trend and exclusion line are unchanged. User spot-checks visually. **[Agent: nextjs-fullstack]**

- [x] **Slice 4: Early-state per-horizon count line**
  - [x] In the early "too few" branch of `GroupCard`, add a `small muted` line with `formatHorizonCounts(buildHorizonBreakdown(group.byHorizon))` under the existing message; no Brier value renders in this state. **[Agent: nextjs-fullstack]**
  - [ ] Verify: on a card with under 30 total outcomes, the "too few" message and the count line (e.g. "1 day: 14 · 7 days: 9 · 30 days: 0") both show and no score appears. User spot-checks visually. **[Agent: nextjs-fullstack]**

- [ ] **Slice 5: Mobile layout + documentation**
  - [ ] Verify at 375px (DevTools device toolbar): all three entries fully visible, page does not scroll sideways. User spot-checks visually. **[Agent: nextjs-fullstack]**
  - [x] Update `context/product/architecture.md` §7.3 to mention `calibration_scores_by_horizon` and the `byHorizon` field. **[Agent: general-purpose]**
  - [x] Update `CLAUDE.md` "Forecast Scoring (spec 011)" to list `0012_calibration_by_horizon.sql`. **[Agent: general-purpose]**
  - [x] Final verify: `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npx tsx src/scripts/scoring.test.ts`, `npx tsx src/scripts/price-context.test.ts`. **[Agent: nextjs-fullstack]**
