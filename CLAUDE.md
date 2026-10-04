# CLAUDE.md

Catoshi Dashboard: Next.js 16 App Router, React 19, TS strict, Tailwind v4, Neon Postgres.

## Commands

```bash
npm run dev          # Start development server (Next.js, http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier write
npm run format:check # Prettier check
npm run daily-analysis  # Run tsx src/scripts/daily-analysis.ts
```

Tests: `npm test` (node --test via tsx, files in `src/scripts/*.test.ts`). Type-check: `npx tsc --noEmit`.

## Architecture (short)

**Route groups**:
- `src/app/(admin)/` — protected dashboard layout
- `src/app/landing/` — public marketing page
- `src/app/api/` — Route Handlers (server-side proxy for all external calls)

**Data flow**: UI component → SWR hook (`src/hooks/`) → fetch /api/<route> → `src/lib/<provider>.ts`.

**Key directories**:
- `src/lib/` — server integrations
- `src/hooks/` — SWR data hooks with polling
- `src/data/types.ts` — canonical TypeScript interfaces
- `src/consts/` — shared constants
- `src/lib/signals/` — market-state signal layer
- `src/lib/news/` — news-impact signal layer
- `src/components/dashboard/` — dashboard UI

Module details, spec history, AI forecast layer, scoring, news pipeline, DB schema: see `context/product/codebase-notes.md` and `context/product/architecture.md`.

## Hard rules

- All external API calls only through Route Handlers (never client-side).
- Guard new API routes with `NEXT_PUBLIC_USE_MOCK_DATA` before calling real external APIs.
- **Constants Rule**: any value used in 2+ files goes to `src/consts/` (code) or `.env`/`.env.example` (environment). No inline API keys, model names, asset IDs, or timing values.
- Path alias `@/*` → `src/*`.
- Changing the realized-scenario rule invalidates every stored score (see `context/product/architecture.md` §7.3).

<!-- awos-tune:start -->
## Working rules (awos-tune)
- UI: one component per file, domain folders, reuse/extend before creating, repeated items via `.map()`. Details: `.claude/skills/component-structure/SKILL.md`. Component map: `context/components-index.md`.
- Spec work: never re-ask what `context/spec/*/decisions.md` already answers.
<!-- awos-tune:end -->
