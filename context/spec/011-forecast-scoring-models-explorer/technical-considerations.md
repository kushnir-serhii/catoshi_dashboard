# Technical Considerations: Forecast Scoring and the Models Explorer

Companion to `functional-spec.md`. What already exists, what the scoring maths actually
is, and the traps found while reading the current code.

---

## 1. What Is Already There

More of this spec is built than it looks. The schema was designed for it.

**1.1. `public.forecasts` already carries everything scoring needs.** `scenarios` (jsonb),
`confidence`, `anchor_price`, `snapshot_id`, `as_of`, `model`, `prompt_version`,
`schema_version`, token counts and `cost_usd`. Nothing needs adding to write a score.

**1.2. `public.outcomes` was shaped for this spec by name.** `horizon_days` (NOT NULL
since 0002), `entry_price`, `actual_price`, `actual_return_pct` as a generated column,
`realized_scenario` constrained to `bull|base|bear`, `unique (forecast_id, horizon_days)`,
and `idx_outcomes_forecast_horizon` — added in 0002 with the comment *"Spec 011 resolves
forecasts whose horizon has elapsed; this is the lookup that job will run."* The table is
empty.

**1.3. Probabilities are already produced and stored.** `ScenarioProbabilities` is
`{ bull, base, bear }` in whole percentage points summing to 100
(`src/data/types.ts`). That is exactly the input a probabilistic score needs — the
forecast layer has been emitting scoreable output all along, and nothing has ever read it.

**1.4. Forecast curves are per-scenario point arrays.** `ForecastPoint = { d, p }` where
`d` is days from generation (≥ 1) and `p` a USD price, one array per scenario. So the
predicted price at horizon *h* is a lookup, not an interpolation, as long as *h* is one of
the generated days.

**1.5. `FORECAST_MODEL_PRICING` exists** (`src/consts/forecastPricing.ts`), closing
roadmap note §5.3. Worth confirming `forecasts.cost_usd` is actually being populated from
it rather than left null.

**1.6. `catoshi-schema.sql` in the project docs is reference design only.** It sketches
`compute_brier` and calibration views that this spec needs, but its column set does not
match the shipped migrations. Read it for intent, not as DDL.

---

## 2. What Is Broken

**2.1. `src/data/models.ts` is fabricated end to end.** Six invented models
(*Tabnet-Pro*, *OnChain-LSTM*, *Macro-XGB*, *Sentiment-BERT*, *TFT-Ensemble*,
*Whale-Graph*), invented accuracies (58.4%–73.1%), invented hit counts (*184/258*),
invented KPIs (*ensemble accuracy 74.0%*, *1,248 predictions/day*, *training cycle 412*,
*avg latency 84ms*), and an invented predictions table with price targets for TAO, ARB
and LINK — assets the collector does not even track. `ModelsPage.tsx` imports and renders
all of it directly.

This is not a stale placeholder. It is a page telling the user the product predicts at 74%
accuracy. Deleting the file is requirement 2.7 and is the highest-value line in this spec.

**2.2. Nothing writes outcomes.** There is no resolver, no scheduled job, no code path
that reads a forecast and compares it to a later price. `daily-analysis.ts` is a snapshot
CLI only.

**2.3. The forecast → snapshot link has no age limit.** Forecasts link to the most recent
snapshot for the asset with no bound. Collection stalls for a day, and the forecast is
recorded as having been made under yesterday's conditions. Requirement 2.6.

**2.4. There is no `brier_score` column.** The score has to live somewhere; see §4.

---

## 3. The Scoring Maths

**Multi-category Brier score.** With three mutually exclusive scenarios and probabilities
summing to 1:

```
BS = Σ (p_i − o_i)²   for i ∈ {bull, base, bear}
```

where `o_i` is 1 for the scenario that occurred and 0 for the others. Lower is better.

**The baseline is 0.667, not 0.25.** This matters enough to state loudly, because
`analytics-automation-spec.md` currently says *"Абсолютне значення < 0.25 = система
калібрована краще за монетку"*. **That figure is wrong for this system.** 0.25 is the
baseline for the *binary, single-event* Brier form (one probability, `(p − o)²`, at
p = 0.5). This system scores three categories with the sum-over-categories form, where a
know-nothing forecaster answering 1/3, 1/3, 1/3 scores:

```
(1/3 − 1)² + (1/3)² + (1/3)² = 4/9 + 1/9 + 1/9 = 0.667
```

Range is 0 (perfect) to 2 (fully confident and wrong). **Judging this system against 0.25
would mark a genuinely skilled forecaster as a failure.** Requirement 2.8 exists because a
score without its baseline invites exactly this mistake; the project doc needs correcting
in the same change.

**Deciding the realized scenario (requirement 2.2).** At horizon *h*, read `bull[h].p`,
`base[h].p`, `bear[h].p` and the actual price. Sort the three predicted prices ascending
(do not assume bull > base > bear — nothing enforces it, and an unsorted assumption is a
silent wrong answer on the day a curve crosses). Cut the axis at the midpoints between
neighbours:

- above `midpoint(base, bull)` → **bull**
- below `midpoint(bear, base)` → **bear**
- otherwise → **base**, including exactly on either boundary

If any two of the three predicted prices are equal, the partition degenerates and the
outcome is **unscoreable**: `realized_scenario` stays null and no score is written. A
guess here would be indistinguishable from a measurement, which is the whole failure mode
this spec exists to end.

**Entry price is the market, not the model.** `forecasts.anchor_price` is what the *model*
said the price was; it can be stale or simply wrong. `outcomes.entry_price` must be the
observed market price at `as_of` — from the linked snapshot, or the price series. Scoring
a forecast against its own possibly-wrong anchor would flatter it.

---

## 4. Where the Score Lives

Add to `public.outcomes`, in a new migration (`0005_outcome_scores.sql`), following the
house style of `0001` — `public.` prefix, named constraints, idempotent:

```sql
alter table public.outcomes
  add column if not exists brier_score double precision;

alter table public.outcomes
  add constraint outcomes_brier_score_check
    check (brier_score is null or (brier_score >= 0 and brier_score <= 2));
```

**Why a stored column rather than a view.** The score depends on the forecast's
probabilities *as they were*; recomputing later from a re-read of `scenarios` is fine
today and fragile the moment the jsonb shape changes. Storing it also makes the null case
explicit — an unscoreable outcome (§3) has no score, which a computed expression would
have to fake.

**Why `double precision` and not `numeric`.** This is a statistical quantity aggregated
over thousands of rows, never money. Exactness is irrelevant; the check constraint carries
the meaning.

**Calibration reads** group by `model` and `prompt_version` (requirement 2.4), join
through to `snapshots` to exclude back-filled rows (2.5), and exclude
`snapshot_id is null` (2.6). Worth a view so the exclusions live in one place rather than
being re-derived in each query — the moment they are copy-pasted, one copy will drift and
report a better number.

---

## 5. Running It

Resolution hangs off the existing hourly `/api/collect` run, after snapshots commit —
the same placement and the same reasoning as spec 014's signal generation. A separate
schedule can drift out of step and silently skip an hour.

**Ordering and isolation.** Snapshots commit first; resolution runs after; a failure in
resolution is caught, logged, surfaced through the existing `SourceStatus` mechanism, and
never fails the run (requirement 2.9). The asymmetry is the point: a lost snapshot hour is
gone forever (spec 010 §1), a lost scoring pass is recomputed next hour.

**What each pass does.** Find forecasts where `as_of + horizon_days` has elapsed and no
outcome exists for that `(forecast_id, horizon_days)`; look up the actual price at the
horizon; write the outcome and its score. Idempotent by the existing unique constraint, so
a re-run is a no-op rather than a duplicate.

**Cost.** Zero model calls. This is arithmetic over stored rows.

---

## 6. The Models Page

`src/data/models.ts` is deleted; `ModelsPage.tsx` is rewritten against a new endpoint that
reads the calibration view.

**The insufficient-data state is the default, not an edge case.** At hourly collection and
a 30-day horizon, the first 30-day outcome appears a month after this ships, and a mean
score over fewer than a few dozen resolved forecasts is noise presented as fact. The page
must be designed for "12 forecasts resolved, too few to report" as its normal early
appearance — requirement 2.7 — and must state the count next to every figure it does show
(2.7, 2.8).

**Do not re-create the KPI row from `models.ts` with real-looking numbers.** *Ensemble
accuracy*, *active models*, *last training* and *predictions per day* describe a system
that does not exist: there is no ensemble, nothing trains, and forecasts are generated on
demand rather than at a daily rate. Replacing invented values with computed ones for
metrics that do not apply would repeat the original error in a subtler form. The page
should show what the system actually has: forecasts resolved, mean score per model and
prompt version against baseline, the trend, and the exclusions.

---

## 7. Testing

Same approach as `src/scripts/signal-rules.test.ts` and `analog-core.test.ts`: the scoring
maths is pure, so it is testable with fixtures and no database.

- Brier: perfect confident forecast → 0; uniform 1/3 → 0.667; confident and wrong → 2.
- Scenario resolution: one case per band, plus both boundary-exact cases resolving to base.
- Degenerate curves (two equal scenario prices) → unscoreable, not a guess.
- Unsorted curves (bull below base at the horizon) → still partitioned correctly.
- Probabilities that do not sum to 100 → rejected or normalised, deliberately, not silently.

The boundary and degenerate cases are the ones that will actually occur and the ones no
reviewer would catch by eye.

---

## 8. Risks

**8.1. The first months say nothing, honestly.** A 30-day horizon means the first
meaningful sample is far away. The risk is not the wait; it is the temptation to fill the
page with something in the meantime. That temptation is what produced `models.ts`.

**8.2. Scoring the scorer.** The realized-scenario rule (§3) is a choice, and a different
midpoint convention would produce different scores. It is fixed in advance and documented
so that it is at least *consistent*; it is not thereby *correct*. If it is ever changed,
past outcomes must be recomputed or the series split, exactly as with prompt versions.

**8.3. Sparse horizons.** If a forecast's curve does not contain a point at the horizon
being scored, there is nothing to compare. Decide explicitly — nearest available day, or
skip — rather than letting an off-by-one produce a quiet wrong answer.

**8.4. Small samples flatter whoever ran last.** With few resolved forecasts, one lucky
call moves the mean a long way. Reporting the count alongside every figure (2.7) is the
minimum defence; it does not make a mean of 12 meaningful, it only makes its weakness
visible.
