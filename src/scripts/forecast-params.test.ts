/**
 * Tests for forecast param validation (src/lib/forecast/params.ts).
 *
 * Run:  npx tsx src/scripts/forecast-params.test.ts
 *
 * No database, no network, no test runner — the helper is pure. Follows the
 * `src/scripts/price-context.test.ts` pattern: a `check(name, ok)` harness
 * counting failures, `section` headers, and a non-zero exit on failure.
 *
 * The regression under test: `/api/projections` used to build its platform
 * cache key from the raw, unvalidated `service`/`model` query params, so any
 * junk value created a new cache entry — unbounded cache-key growth. This
 * guards that `validateForecastParams` collapses every unknown/empty/junk
 * pair to the single default pair, so the derived cache key is bounded.
 */

import {
  ALLOWED_FORECAST_MODELS,
  DEFAULT_FORECAST_MODEL,
  DEFAULT_FORECAST_SERVICE,
} from '@/consts/projections';
import { validateForecastParams } from '@/lib/forecast/params';

let failures = 0;

function check(name: string, ok: boolean): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

function section(title: string): void {
  console.log(`\n— ${title}`);
}

function cacheKey(result: { service: string; model: string }): unknown[] {
  return ['projections', result.service, result.model];
}

const DEFAULT_PAIR = { service: DEFAULT_FORECAST_SERVICE, model: DEFAULT_FORECAST_MODEL };
const defaultKey = cacheKey(DEFAULT_PAIR);

section('known valid pairs pass through unchanged');
check(
  'claude / claude-sonnet-4-6 passes through',
  JSON.stringify(validateForecastParams('claude', 'claude-sonnet-4-6')) ===
    JSON.stringify({ service: 'claude', model: 'claude-sonnet-4-6' }),
);

for (const [service, models] of Object.entries(ALLOWED_FORECAST_MODELS)) {
  for (const model of models) {
    check(
      `${service} / ${model} passes through unchanged`,
      JSON.stringify(validateForecastParams(service, model)) === JSON.stringify({ service, model }),
    );
  }
}

section('unknown service collapses to the default pair');
check(
  'notaprovider + any model → default pair',
  JSON.stringify(validateForecastParams('notaprovider', 'claude-sonnet-4-6')) ===
    JSON.stringify(DEFAULT_PAIR),
);

section('known service + unknown model collapses to the default pair');
check(
  'claude + gpt-4o (belongs to openai) → default pair',
  JSON.stringify(validateForecastParams('claude', 'gpt-4o')) === JSON.stringify(DEFAULT_PAIR),
);

section('empty strings collapse to the default pair');
check(
  'empty service + empty model → default pair',
  JSON.stringify(validateForecastParams('', '')) === JSON.stringify(DEFAULT_PAIR),
);

section('fifty junk values all collapse to the identical default pair');
let allJunkCollapsed = true;
let allJunkKeysMatch = true;
for (let i = 0; i < 50; i++) {
  const junkModel = `junk-${i}`;
  const junkService = i % 2 === 0 ? 'claude' : `bogus-service-${i}`;
  const result = validateForecastParams(junkService, junkModel);
  if (JSON.stringify(result) !== JSON.stringify(DEFAULT_PAIR)) allJunkCollapsed = false;
  if (JSON.stringify(cacheKey(result)) !== JSON.stringify(defaultKey)) allJunkKeysMatch = false;
}
check('all 50 junk-value pairs collapse to the default pair', allJunkCollapsed);
check('REGRESSION: all 50 junk-value cache keys equal the default cache key', allJunkKeysMatch);

const emptyKey = cacheKey(validateForecastParams('', ''));
check(
  'REGRESSION: the empty-string cache key equals the default cache key',
  JSON.stringify(emptyKey) === JSON.stringify(defaultKey),
);

console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
