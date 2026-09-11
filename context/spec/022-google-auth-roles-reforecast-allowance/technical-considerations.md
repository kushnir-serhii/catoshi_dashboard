# Technical Specification: Accounts, Roles and a Per-Person Reforecast Allowance

- **Functional Specification:** `context/spec/022-google-auth-roles-reforecast-allowance/functional-spec.md`
- **Status:** Draft
- **Author(s):** Serhii Kushnir

---

## 1. High-Level Technical Approach

Identity is added with **Auth.js v5 (`next-auth@5`) configured with the Google provider only**,
a JWT session cookie, and our own `public.users` table in the existing Neon Postgres database.
The session cookie carries the internal user id and nothing else; **role and remaining allowance
are read from the database on every guarded server-side call**, so a promotion or demotion takes
effect on the person's next request without a sign-out.

Everything a guest can read today stays unauthenticated. The only behaviour gated by identity is
producing a forecast (`POST /api/projections/refresh`), the new administration area, and the
operator controls that currently sit behind `ADMIN_SECRET`.

The daily allowance is enforced server-side inside the refresh route, backed by a new
append-only `public.forecast_usage` ledger plus an `allowance_reset_at` marker on the user row.
A row is written **only after a forecast is actually produced**, so a failed generation costs the
person nothing. The product-wide ceiling `FORECAST_DAILY_CALL_LIMIT` is removed from the paid
path, and `ADMIN_SECRET` / `/api/admin/unlock` / the `catoshi_admin` cookie are deleted.

Affected systems: the Next.js Route Handler layer, the Neon schema (one new migration), the
dashboard shell header, the Projections page's Reforecast controls, and a new admin page.
The scheduled-ingest path (`FORECAST_INGEST_SECRET`, spec 020) and `CRON_SECRET` are
machine-to-machine credentials and are **not** touched.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1 Architecture Changes

A new **identity layer** sits between the Route Handlers and the database:

```
Browser
  -> Auth.js route handler  /api/auth/[...nextauth]   (Google OAuth code flow, session cookie)
  -> guarded Route Handler
       -> src/lib/auth/session.ts     resolve session cookie -> user id
       -> src/lib/auth/authorize.ts   user id -> { role, remaining } read fresh from Postgres
       -> existing forecast / admin logic
```

`src/lib/auth/` is server-only, mirroring the placement of `src/lib/db/` and `src/lib/signals/`.
No auth SDK is imported into a client component; the client learns who it is from a single
read-only endpoint (§2.4).

Auth.js is configured with:

- **Google provider only.** No email/password provider, no credentials provider, no magic link.
- **JWT session strategy**, not a database session table. The token carries the internal user id.
  Role is deliberately *not* stamped into it — see §2.6.
- **Session lifetime 30 days, rolling**, satisfying "closing the browser and returning later
  leaves me still signed in".
- **`signIn` callback** upserts `public.users` on first sign-in and returns `false` only on a
  database failure, so an account is never created twice and a broken database never produces
  a half-signed-in person.

Exact provider and callback syntax is in the Auth.js v5 App Router documentation; it is not
duplicated here.

### 2.2 Data Model / Database Changes

One new migration, `db/migrations/0010_accounts.sql`.

**`public.users`** — one row per person who has ever signed in.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` identity PK | internal id; the value the session cookie carries |
| `google_sub` | `text` not null unique | Google's stable subject claim, the join key on sign-in |
| `email` | `text` not null | from Google, refreshed on each sign-in |
| `name` | `text` | from Google, nullable — Google does not always supply one |
| `image_url` | `text` | avatar, nullable |
| `role` | `text` not null default `'user'` | check constraint `in ('user','admin')` |
| `allowance_reset_at` | `timestamptz` | null unless an admin restored today's allowance |
| `created_at` | `timestamptz` not null default `now()` | "when they first signed in" in the admin list |
| `last_seen_at` | `timestamptz` not null default `now()` | updated on sign-in |

`google_sub` is the identity key, not `email` — a Google account can change its email address
while keeping the same subject.

**`public.forecast_usage`** — append-only, one row per forecast actually produced by a press.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` identity PK | |
| `user_id` | `bigint` not null FK to `users(id)` on delete cascade | |
| `created_at` | `timestamptz` not null default `now()` | the instant charged against the allowance |
| `forecast_as_of` | `timestamptz` | the `as_of` group written to `public.forecasts`, for cross-reference; nullable |

Index: `(user_id, created_at desc)` — the only read pattern.

**Nothing is deleted or mutated.** Remaining allowance is a query, never a stored counter. The
window start is the later of the current UTC midnight and the person's `allowance_reset_at`;
`used` is the count of ledger rows since that instant, and `remaining` is the allowance minus
`used`, clamped at zero.

An admin "restoring" someone's allowance is a single write of `allowance_reset_at = now()`.
The ledger keeps the full history of what was spent and when.

**No `accounts` / `sessions` / `verification_token` tables.** The Auth.js Postgres adapter's
schema exists to store refresh tokens and database sessions; with a JWT session and a single
provider we need neither, so the `signIn` callback writes `public.users` directly rather than
pulling in the adapter's four-table schema.

### 2.3 Constants and Environment

New constants in **`src/consts/auth.ts`** (per the project's constants rule):

- `DAILY_FORECAST_ALLOWANCE = 3`
- `ROLE_USER = 'user'`, `ROLE_ADMIN = 'admin'`, and the `Role` union type
- `SESSION_MAX_AGE_SECONDS` (30 days)
- `ADMIN_PATH = '/admin'`

New environment variables, added to `.env.example` and Vercel project settings:

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js JWT signing key |
| `AUTH_GOOGLE_ID` | Google OAuth client id |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_URL` | canonical origin, required for the OAuth callback on Vercel preview deploys |

**Removed:** `ADMIN_SECRET`. `FORECAST_INGEST_SECRET`, `CRON_SECRET` and
`NEWS_CLASSIFY_ENABLED` stay.

A Google Cloud OAuth client must be created with the authorised redirect URI
`https://<domain>/api/auth/callback/google`, plus the localhost equivalent for development.

### 2.4 API Contracts

**New**

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | none | Auth.js catch-all: sign-in, callback, sign-out, session |
| `/api/me` | GET | any | The client's single identity read. Returns role (`guest`, `user` or `admin`), name, email, image URL, `remaining` and `resetsAt`. `remaining` is null for a guest and for an admin, since an admin has no count to show. Always HTTP 200 — being a guest is not an error. `dynamic = 'force-dynamic'`, never cached. |
| `/api/admin/users` | GET | admin | The administration list: id, name, email, role, `created_at`, forecasts used today. 401 for a guest, 403 for a user. |
| `/api/admin/users/[id]/role` | PATCH | admin | Body carries the new role. **409 when an admin targets their own row with the user role**, with a body explaining that an admin cannot remove their own access. |
| `/api/admin/users/[id]/allowance` | POST | admin | Restores the target's allowance for the current UTC day by setting `allowance_reset_at = now()`. Returns the recomputed `remaining`. |

**Changed — `POST /api/projections/refresh`**

The `checkAdminAuth` helper and its `ADMIN_COOKIE_NAME` branch are deleted and replaced by the
session check. New response contract:

| Condition | Status | Body |
|---|---|---|
| Guest | `401` | error plus `reason: 'signin-required'` |
| Signed in, allowance remaining, generation succeeds | `200` | existing `ProjectionsResponse`, plus the recomputed `remaining` |
| Signed in, allowance exhausted | `429` | error plus `reason: 'allowance-exhausted'`, `remaining: 0`, `resetsAt` |
| Admin | never rate-limited | — |
| Generation fails | `500` | existing shape; **no usage row is written** |

`resetsAt` is the next 00:00 UTC as an ISO string, computed server-side so the message can always
name the reset time rather than leaving the client to guess it.

The `FORECAST_DAILY_CALL_LIMIT` block and its `getDailyForecastGenerationCount()` call are removed
from this route. `getDailyForecastGenerationCount` itself stays in `src/lib/db/analytics.ts` only
if another caller needs it; otherwise it is deleted with the ceiling.

**Deleted — `GET /api/admin/unlock`.** The route, `ADMIN_COOKIE_NAME` in `src/consts/projections.ts`,
and the cookie branch of its callers all go. `matchesAdminSecret` itself stays, still used by
`checkIngestAuth` for `FORECAST_INGEST_SECRET`.

**Unchanged and still unauthenticated:** `/api/prices*`, `/api/markets`, `/api/coins/list`,
`/api/signals`, `/api/models`, `GET /api/projections`. `/api/collect` keeps its `CRON_SECRET`
bearer check; `/api/projections/inputs` and `/api/projections/ingest` keep `FORECAST_INGEST_SECRET`.

### 2.5 Server-Side Authorization Helpers

**`src/lib/auth/session.ts`** — `getCurrentUser()` resolves the Auth.js session to the user row or
null, doing the one indexed `public.users` read. Server-only.

**`src/lib/auth/authorize.ts`** — the two guards every protected Route Handler uses:

- `requireUser()` returns the user or a typed guest refusal
- `requireAdmin()` returns the user or a typed guest / forbidden refusal

Returning a typed refusal rather than throwing keeps each route responsible for its own status
code and message, matching the existing `IngestAuthResult` three-way pattern in
`src/lib/ingestAuth.ts`.

**`src/lib/auth/allowance.ts`** — pure and impure halves kept separate so the arithmetic is
testable without a database:

- pure: `remainingAllowance(usedCount, role)`, `allowanceWindowStart(now, resetAt)`,
  `nextResetAt(now)` — the UTC-midnight boundary maths
- impure: `readUsage(userId)`, `recordUsage(userId, forecastAsOf)`, `restoreAllowance(userId)`
  in `src/lib/db/allowance.ts`, alongside the existing `src/lib/db/` modules

### 2.6 Enforcement Order in the Refresh Route

The order matters, because the spec forbids charging for a forecast that was not produced:

1. `requireUser()` — a guest gets 401.
2. Mock mode (`NEXT_PUBLIC_USE_MOCK_DATA=true`) returns mock projections. **No allowance is read
   or spent**, exactly as it bypasses the ceiling today.
3. If the role is `user`, read remaining. A null result means the database read failed, so the
   route fails closed with 503. Zero means 429 with `resetsAt`. Admins skip this step entirely.
4. Run the generation.
5. **Only on success**: `revalidateTag('projections')`, then write the `forecast_usage` row.
6. Return the projections with the freshly recomputed `remaining`, so the button's count updates
   from the same response that redrew the chart rather than a follow-up poll.

Step 5's usage write is deliberately after `revalidateTag` and is **awaited**, not
fire-and-forget. If the ledger write fails we have still served a forecast, so the failure is
logged and the response still succeeds. This is a knowingly asymmetric trade: a lost ledger write
gives the person a free forecast, which is far better than charging for one they did not get.

There is a benign race. Two simultaneous presses can both read a remaining count of one and both
produce a forecast. At an allowance of three and a single human pressing a button this is not
worth a transaction or an advisory lock, and it is recorded here as accepted rather than
overlooked.

### 2.7 Route Protection

A `middleware.ts` at the project root matches `/admin/:path*` only. It performs the cheap
cookie-presence check and redirects a person with no session to the Google sign-in flow with a
callback URL back to the admin path. **It is not the authorization boundary** — middleware cannot
read Postgres, so it cannot know a role. The real check is `requireAdmin()` inside the page's
server component and inside every `/api/admin/*` handler. A signed-in non-admin reaching the admin
path is rendered a "you do not have access" state with a link back to the dashboard, per §2.5 of
the functional spec.

### 2.8 Component Breakdown

**`src/components/layout/Header.tsx`** gains the account control:

- `SignInButton` — guest state, one control, "Continue with Google", calling Auth.js `signIn` with
  the current path as the callback URL.
- `AccountMenu` — signed-in state. Name, email, remaining count with reset time (hidden for an
  admin), an "Admin" link when the role is admin, and "Sign out".

**`src/hooks/useSession.ts`** — a thin SWR hook over `GET /api/me`, keyed `'me'`, no polling,
revalidate on focus. It is the single client-side source of who the viewer is; no component calls
Auth.js directly. Its `mutate` is called after a successful reforecast so the count updates.

**`src/components/panels/ChartPanel.tsx` and `ScenarioPanel.tsx`** — the Reforecast button:

- Guest: the label stays "Reforecast", the button stays enabled and un-greyed, and pressing it
  opens the sign-in invitation instead of calling the API. It never optimistically fires the
  forecast after sign-in; the person presses again deliberately.
- User: the label reads "Reforecast — n left today".
- User at zero: pressing shows the exhausted message naming the reset time. The client refusal is
  a courtesy; the server refuses independently.
- Admin: the label is plain "Reforecast", with no count.

**`src/hooks/useProjections.ts`** — `describeRefreshError` is rewritten against the new contract.
401 becomes "Sign in to reforecast", 429 reads `resetsAt` from the body and names the time, and
the "Operator unlock required" string is removed.

**`src/components/pages/AdminPage.tsx`** plus `src/app/(admin)/admin/page.tsx` — the administration
area. A table of everyone with a role control per row, a "Restore allowance" action per row, and
the self-demotion refusal surfaced inline. Data comes from a `useAdminUsers` SWR hook over
`/api/admin/users`, revalidated after every mutation so the list reflects a change immediately.

**`src/consts/nav.ts`** gains an "Admin" entry flagged admin-only, filtered out of the rendered
nav unless the session role is admin.

### 2.9 Retiring the Shared Operator Credential

Functional spec §2.5 requires the operator controls to move behind the admin role. Two of the
three named surfaces do not exist as UI today, so this spec builds them minimally rather than
pretending they only need re-gating:

- **News classification pause.** Today this is the `NEWS_CLASSIFY_ENABLED` environment variable,
  read by `src/lib/freshness.ts` and `/api/collect`. An environment variable cannot be toggled by a
  signed-in admin. It moves to a new `public.app_settings` table (key, value, `updated_at`,
  `updated_by`) in the same `0010` migration, with `isNewsClassificationPaused()` reading the row
  and falling back to the environment variable when the row is absent. A
  `PATCH /api/admin/settings/news-pause` guarded by `requireAdmin()` toggles it, surfaced on the
  admin page.
- **Operator health and freshness views.** `GET /api/health` **stays unauthenticated and
  unchanged**. It is spec 017's uptime-checker contract, it exposes no secret, and putting it
  behind a session would break the external monitor that is the entire alerting layer. What
  becomes admin-only is the *operator view* of it: a panel on the admin page rendering the health
  payload with per-collector detail. This is an explicit narrowing of functional spec §2.5 and
  needs confirmation at review.
- **`ADMIN_SECRET` deletion** is what actually satisfies "the shared operator credential no longer
  grants access to anything". After §2.4's deletions, holding the value does nothing.

---

## 3. Impact and Risk Analysis

### System Dependencies

- **Neon Postgres** — two new tables plus `app_settings`, on the same pooled `pg.Pool`. Every
  guarded request now costs one extra indexed read. The affected routes are the refresh route,
  `/api/me` and `/api/admin/*`, none of which are polled hard. Guest-visible read paths gain no
  database work at all.
- **Google OAuth** — a new external dependency on the sign-in path only. Google being down blocks
  new sign-ins and nothing else: existing sessions and every read path keep working.
- **`next-auth@5`** — the one new runtime dependency. Version 5 is still published under a beta
  tag, so pin the exact version rather than a caret range.
- **Vercel** — three new server-only environment variables plus `AUTH_URL`. Preview deploys get
  rotating hostnames, so either a fixed `AUTH_URL` or a wildcard redirect URI is needed for
  sign-in to work on previews.
- **Specs 019 and 020, and the product documents** — spec 019's shared-credential and
  product-ceiling design is superseded here. `architecture.md` §3.1's auth column and §6, and
  `product-definition.md` §3.2 and §3.3, all need updating, as functional spec §4 requires.

### Potential Risks & Mitigations

- **Unbounded aggregate cost.** Accepted deliberately in functional spec §1, but removing
  `FORECAST_DAILY_CALL_LIMIT` deletes the only backstop that exists. Mitigation: the
  `forecast_usage` ledger alongside `forecasts.cost_usd` makes daily spend measurable per person
  from day one, so reinstating a global ceiling later is a query away rather than a redesign.
- **Charging for a forecast that failed.** Mitigated by the strict ordering in §2.6 — the ledger
  row is written after a successful generation and never before.
- **Losing all admin access.** Two guards: the self-demotion refusal in §2.4, and the first admin
  being granted by a direct SQL update against Neon, which remains the recovery path if the
  application-level guard is ever circumvented.
- **The first-admin bootstrap.** Deliberately manual: sign in once as a normal user, then update
  that row's role directly in the database. This is documented in the deployment notes and not
  automated, because an environment-variable-driven auto-promotion would recreate exactly the
  shared-secret escalation path this spec removes.
- **Middleware mistaken for the authorization boundary.** Called out explicitly in §2.7. The guard
  that matters is `requireAdmin()` in the handler, and every `/api/admin/*` route must carry it
  independently of middleware.
- **Session fixation on a shared machine.** Auth.js rotates the session cookie on sign-in and
  clears it on sign-out; the account menu's sign-out is the documented remedy.
- **Concurrent-press race on the allowance.** Accepted, §2.6.
- **Guest experience regression.** The largest silent risk is a guarded route accidentally
  guarding a read path. Mitigated by the testing strategy's explicit guest sweep.

---

## 4. Testing Strategy

The project has no test runner; existing suites are standalone `npx tsx` scripts
(`src/scripts/scoring.test.ts`, `signal-rules.test.ts`, `watchlist.test.ts`). This spec follows
that pattern rather than introducing one.

- **Unit — `src/scripts/allowance.test.ts` via `npx tsx`.** The pure half of §2.5, which is where
  the rules that can silently be wrong live. `remainingAllowance` clamping at zero and returning
  null for an admin. `allowanceWindowStart` picking the later of UTC midnight and
  `allowance_reset_at`. `nextResetAt` landing on 00:00 UTC across a day boundary, a month boundary
  and a leap day. Usage recorded at 23:59 UTC not counting one minute later.
- **Unit — refusal mapping.** `describeRefreshError` against each new status, including the 429
  body that carries `resetsAt` and the one that does not.
- **Integration by hand**, against a local database and a development Google client, one pass per
  branch of the enforcement order in §2.6. A guest press gives 401 and writes no ledger row. The
  first three presses give three forecasts and three ledger rows. The fourth gives 429 naming the
  reset time, with still three rows. A forced generation failure gives 500 and **no** fourth row.
  An admin presses four times, all succeeding, with no count on the button.
- **Integration — admin surface.** Promote and demote another account and confirm the change lands
  on that person's next request with no sign-out. Attempt self-demotion and confirm the 409.
  Restore an exhausted person's allowance and confirm the count returns to three. Reach the admin
  path as a user and as a guest and confirm the two distinct refusals.
- **Regression — the guest sweep.** With no session cookie at all, load every dashboard screen:
  projections, markets, signals, models, the watchlist. Confirm each renders exactly what it
  renders today, including a stored forecast being served to a guest. This is the check that the
  spec's central promise, that nothing else changes, actually holds.
- **`npx tsc --noEmit` and `npm run lint`** on every slice, per the existing workflow.
