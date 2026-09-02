import { NextResponse } from 'next/server';

import type {
  ModelCalibrationGroup,
  ModelsExclusionSummary,
  ModelsResponse,
  ModelTrendPoint,
} from '@/data/types';
import { query } from '@/lib/db/client';

// Scoring runs hourly off `/api/collect`; a static cache would freeze the
// Models page against a stale calibration read. Never cache this route.
export const dynamic = 'force-dynamic';

/**
 * Every exclusion lives in `public.calibration_base.exclusion_reason`
 * (db/migrations/0006). This route does NO computation: it selects the
 * per-(model, prompt_version) aggregates from `public.calibration_scores`,
 * attaches each group's monthly series from `public.calibration_trend` as a
 * JSON array (grouping only, no arithmetic), reads the product-wide excluded
 * counts from `public.calibration_exclusions`, and returns the rows as JSON.
 * The threshold checks (`MIN_SCORED_SAMPLE_SIZE`, `NO_SKILL_BRIER_BASELINE`)
 * are the page's job, not this one's.
 */
const GROUPS_QUERY = `
  select
    cs.model                as model,
    cs.prompt_version       as prompt_version,
    cs.scored_count         as scored_count,
    cs.mean_brier           as mean_brier,
    cs.excluded_count       as excluded_count,
    cs.excluded_backfilled  as excluded_backfilled,
    cs.excluded_unlinked    as excluded_unlinked,
    cs.excluded_unscoreable as excluded_unscoreable,
    cs.total_outcomes       as total_outcomes,
    coalesce(
      (
        select json_agg(
                 json_build_object(
                   'month', to_char(ct.month, 'YYYY-MM-DD"T00:00:00Z"'),
                   'meanBrier', ct.mean_brier,
                   'scoredCount', ct.scored_count
                 )
                 order by ct.month
               )
        from public.calibration_trend ct
        where ct.model = cs.model
          and ct.prompt_version = cs.prompt_version
      ),
      '[]'::json
    ) as trend
  from public.calibration_scores cs
  order by cs.model, cs.prompt_version
`;

const EXCLUSIONS_QUERY = `
  select
    total_outcomes,
    scored_count,
    excluded_count,
    excluded_backfilled,
    excluded_unlinked,
    excluded_unscoreable
  from public.calibration_exclusions
`;

interface GroupRow {
  model: string;
  prompt_version: string;
  scored_count: number;
  mean_brier: number | null;
  excluded_count: number;
  excluded_backfilled: number;
  excluded_unlinked: number;
  excluded_unscoreable: number;
  total_outcomes: number;
  trend: ModelTrendPoint[];
}

interface ExclusionsRow {
  total_outcomes: number;
  scored_count: number;
  excluded_count: number;
  excluded_backfilled: number;
  excluded_unlinked: number;
  excluded_unscoreable: number;
}

const EMPTY_EXCLUSIONS: ModelsExclusionSummary = {
  totalOutcomes: 0,
  scoredCount: 0,
  excludedCount: 0,
  excludedBackfilled: 0,
  excludedUnlinked: 0,
  excludedUnscoreable: 0,
};

export async function GET(): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    // Mock mode never resolves real forecasts, so there is nothing measured —
    // the honest insufficient-data payload, matching how `/api/signals` behaves.
    const response: ModelsResponse = { groups: [], exclusions: EMPTY_EXCLUSIONS };
    return NextResponse.json(response);
  }

  try {
    const [groupRows, exclusionRows] = await Promise.all([
      query<GroupRow>(GROUPS_QUERY),
      query<ExclusionsRow>(EXCLUSIONS_QUERY),
    ]);

    const groups: ModelCalibrationGroup[] = groupRows.map((row) => ({
      model: row.model,
      promptVersion: row.prompt_version,
      scoredCount: row.scored_count,
      meanBrier: row.mean_brier,
      excludedCount: row.excluded_count,
      excludedBackfilled: row.excluded_backfilled,
      excludedUnlinked: row.excluded_unlinked,
      excludedUnscoreable: row.excluded_unscoreable,
      totalOutcomes: row.total_outcomes,
      trend: row.trend,
    }));

    const e = exclusionRows[0];
    const exclusions: ModelsExclusionSummary = e
      ? {
          totalOutcomes: e.total_outcomes,
          scoredCount: e.scored_count,
          excludedCount: e.excluded_count,
          excludedBackfilled: e.excluded_backfilled,
          excludedUnlinked: e.excluded_unlinked,
          excludedUnscoreable: e.excluded_unscoreable,
        }
      : EMPTY_EXCLUSIONS;

    const response: ModelsResponse = { groups, exclusions };
    return NextResponse.json(response);
  } catch (error: unknown) {
    // A dead database — or calibration views absent — must not read as "no
    // skill measured yet". Report it so the page can show an explicit error.
    console.error('[models] calibration query failed:', error);
    const response: ModelsResponse = {
      groups: [],
      exclusions: EMPTY_EXCLUSIONS,
      fetchError: true,
    };
    return NextResponse.json(response);
  }
}
