# Technical Specification: Forecast Accuracy by Horizon

- **Functional Specification:** [functional-spec.md](./functional-spec.md)
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

This change only affects how scores are read. No table changes, no change to how outcomes
are scored, and no change to how often scoring runs.

`public.outcomes.horizon_days` is already stored per row: one outcome per
`(forecast_id, horizon_days)`, from migration `0002`. `public.calibration_base` already
selects it. It just isn't grouped by horizon anywhere downstream yet. The change adds:

1. **A new SQL view** `public.calibration_scores_by_horizon`. It does the same aggregation
   as `calibration_scores`, also grouped by `horizon_days`, and reads
   `calibration_base.exclusion_reason` unchanged.
2. **A `byHorizon` array on each group returned by `/api/models`.** It is attached in SQL
   with `json_agg`, the same way `trend` is today. The route still does no computation.
3. **A pure TypeScript helper** `src/lib/scoring/horizonBreakdown.ts`. It turns the
   sparse rows from the view into exactly three entries in `SCORED_HORIZON_DAYS` order,
   and gives each one a display state. It has unit tests.
4. **A "By horizon" row and an early-state count line in `GroupCard`**, in
   `src/components/pages/ModelsPage.tsx`, using the card's existing inline-style tokens.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Data Model / Database Changes

**New migration:** `db/migrations/0012_calibration_by_horizon.sql`. It creates one view and
touches no tables.

| View                                   | Source                    | Grouped by                                | Columns                                                                     |
| -------------------------------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `public.calibration_scores_by_horizon` | `public.calibration_base` | `model`, `prompt_version`, `horizon_days` | `model`, `prompt_version`, `horizon_days`, `scored_count` (int), `mean_brier` (double precision, NULL when `scored_count = 0`) |

- `scored_count` and `mean_brier` use exactly the same filter as `calibration_scores`
  (`exclusion_reason is null`). That shared filter is what makes the three horizon counts
  add up to the card's overall count (functional spec §2.5). Exclusions keep living in
  `calibration_base` only, as the `0006` header requires.
- Written with `create or replace view`, so re-running it is safe, like `0006`. It is
  applied with `scripts/migrate.mjs` against `DATABASE_URL_UNPOOLED`.
- No excluded-count breakdown per horizon. The card's exclusion line stays per card.

### 2.2 API Contracts

`GET /api/models`: same URL, auth, caching (`force-dynamic`) and error behaviour. The
response gains one field on every group; nothing else changes.

| Type (`src/data/types.ts`)        | Change                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ModelHorizonScore` (new)         | `{ horizonDays: number; scoredCount: number; meanBrier: number \| null }`                             |
| `ModelCalibrationGroup`           | adds `byHorizon: ModelHorizonScore[]`. This is the raw view output: sparse, and ordered by `horizon_days` |

- `GROUPS_QUERY` in `src/app/api/models/route.ts` gets a second correlated
  `coalesce(json_agg(...) order by horizon_days, '[]'::json)` subquery against
  `calibration_scores_by_horizon`. It follows the existing `trend` subquery. `GroupRow` gets
  `by_horizon`, which maps straight to `byHorizon`.
- The mock path (`NEXT_PUBLIC_USE_MOCK_DATA=true`) still returns `groups: []`, so no mock
  data changes.
- If the new view is missing (for example, a deploy before the migration ran), the whole
  query fails and the existing `fetchError: true` path runs. See §3.

### 2.3 Logic: `src/lib/scoring/horizonBreakdown.ts` (new, pure)

This module has no I/O. It reuses `SCORED_HORIZON_DAYS`, `MIN_SCORED_SAMPLE_SIZE` and
`NO_SKILL_BRIER_BASELINE` from `src/consts/scoring.ts`. It adds no new constants.

| Export                                  | Responsibility                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildHorizonBreakdown(byHorizon)`      | Returns exactly one entry per `SCORED_HORIZON_DAYS` value, in that order. A missing horizon becomes `scoredCount: 0, meanBrier: null`. Rows whose `horizonDays` is not a scored horizon are dropped. |
| `HorizonEntry` state                    | `'scored'` when `scoredCount >= MIN_SCORED_SAMPLE_SIZE` and `meanBrier !== null`, with `beating` (`meanBrier < baseline`) and `delta` (absolute gap). Otherwise `'insufficient'`, carrying only the count. |
| `horizonLabel(days)`                    | `1 → "1 day"`, `n → "n days"`.                                                                                                                                                                      |
| `formatHorizonCounts(entries)`          | The early-state line, e.g. `"1 day: 14 · 7 days: 9 · 30 days: 0"`.                                                                                                                                  |

The helper also produces the threshold state for each horizon. Keeping that logic out of
JSX means the "never show a score below 30" rule (functional spec §2.3) has a unit test.

### 2.4 Component Breakdown: `GroupCard` in `src/components/pages/ModelsPage.tsx`

- **Normal state** (the card has ≥ 30 scored outcomes): a new "By horizon" block goes
  between the "Based on N scored outcomes" line and the `group.trend` block (functional
  spec §2.1). It renders the three `HorizonEntry` items:
  - `scored`: the horizon label, `meanBrier.toFixed(3)`, then "Beating"/"Below" with
    `delta.toFixed(3)`, then "N scored". The colour is `var(--green)` / `var(--red)`, the
    same as the overall score.
  - `insufficient`: the label plus `"N scored · not enough yet"` in muted text, with no
    number.
- **Early state** (`meanBrier === null` or `scoredCount < MIN_SCORED_SAMPLE_SIZE`): the
  existing "too few" `<p>` stays exactly as it is. One new `small muted` line under it shows
  `formatHorizonCounts(...)`. No Brier value is rendered in this state (functional spec
  §2.4).
- **Layout / mobile:** the three entries sit in a flex container with `flexWrap: 'wrap'`,
  a `var(--sp-*)` gap, and a small `flex: 1 1 <min-width>` basis on each entry. On desktop
  they sit side by side. At 375px they stack with no horizontal overflow (functional spec
  §2.6). This is the same inline-style / CSS-variable approach the card already uses; no
  Tailwind utilities are added to this component.
- Nothing else on the card changes: header, overall score, baseline line, count, trend and
  `GroupExclusionLine`.

### 2.5 Documentation

- `context/product/architecture.md` §7.3: mention the new view and the `byHorizon` field.
- `CLAUDE.md` "Forecast Scoring (spec 011)": add `0012_calibration_by_horizon.sql` to the
  migrations list.

---

## 3. Impact and Risk Analysis

- **System dependencies:** This depends on `outcomes.horizon_days` (migration `0002`) and
  `calibration_base` (migration `0006`). It changes nothing in `/api/collect`, the resolver,
  `brier.ts`, `realizedScenario.ts` or any stored score. `useModels.ts` needs no change;
  the new field comes through via `ModelsResponse`.

| Risk                                                                                                                         | Mitigation                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code deploys before `0012` is applied, so the view is missing, the query fails, and the whole Models page shows its fetch-error state. | Apply `0012` to Neon before merging. The task list orders the migration first. The failure is visible and recovers on its own; it never shows a wrong score.                                                                  |
| A stored `horizon_days` outside `{1, 7, 30}` (legacy rows) would be dropped by the helper, so the three counts would not add up to the overall count (§2.5). | Before shipping, run `select distinct horizon_days from calibration_base` against Neon. The resolver only writes `SCORED_HORIZON_DAYS`, so none are expected. If any exist, raise it rather than silently changing the view. |
| A horizon's score is shown with fewer than 30 outcomes.                                                                      | The threshold check lives in `buildHorizonBreakdown` and is unit-tested at 0, 29 and 30. The component only renders a number for the `'scored'` state.                                                                        |
| The monthly trend is read as per-horizon.                                                                                    | It stays blended (out of scope). The "By horizon" block sits above it and is labelled, and the trend's own label is unchanged.                                                                                                |
| A narrow screen overflows.                                                                                                   | Wrapping flex with a min-width basis. Checked manually at 375px.                                                                                                                                                              |

---

## 4. Testing Strategy

- **Unit (pure):** new cases in `src/scripts/scoring.test.ts`, using the existing
  `check` / `section` harness and run with `npx tsx src/scripts/scoring.test.ts`:
  - Output is always 3 entries in the order 1 / 7 / 30, whatever the input order, including
    empty input.
  - Missing horizons are filled with `0` / `null`. Stray horizons (e.g. `14`) are dropped.
  - Threshold: 29 → `insufficient`; 30 → `scored`; `scoredCount ≥ 30` with a
    `meanBrier` of `null` → `insufficient`.
  - Beating / below: `0.5 → beating`, `0.8 → below`, and `delta` is correct.
  - The spec example: 94 one-day and 12 thirty-day outcomes give a 1-day score and a 30-day
    `insufficient` entry with count 12.
  - `formatHorizonCounts` produces exactly `"1 day: 14 · 7 days: 9 · 30 days: 0"`.
  - Counts add up: for a fixture, the sum of the entry counts equals the sum of the input
    counts.
- **Database check (manual, against Neon after `0012`):** for every
  `(model, prompt_version)`, `sum(scored_count)` from `calibration_scores_by_horizon`
  equals `calibration_scores.scored_count`. Also run the distinct-horizon check from §3.
- **Static:** `npx tsc --noEmit`, `npm run lint`, `npm run format:check`.
- **UI (manual):** run `npm run dev` and open `/models` against the real database. Check
  the order of the three entries, the green/red colouring, a card in the "not enough yet"
  state, and a card in the early state. Check at 375px width with no horizontal scroll.
