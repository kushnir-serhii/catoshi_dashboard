# Tasks: Accounts, Roles and a Per-Person Reforecast Allowance (Spec 022)

Each slice leaves the app runnable. Run `npx tsc --noEmit` and `npm run lint` at the end of
every slice. UI slices are verified in the browser by the user (OAuth + click-through);
API/DB slices are verified with `curl` against `npm run dev` and row checks via the Neon MCP.

Decisions locked with the author:

- Admin area: an **admin-only nav entry** in `src/consts/nav.ts` **and** a protected `/admin` route.
- Guest sign-in invitation on Reforecast: a **modal dialog**.
- Verification: the user connects a browser and drives the Google OAuth flow and UI checks
  personally; agents do `curl` / SQL / `tsc` / `lint`.

---

## Slice 1: A visitor can sign in with Google and see they are signed in

- [x] Add `db/migrations/0010_accounts.sql` creating `public.users`, `public.forecast_usage`
      (index `(user_id, created_at desc)`) and `public.app_settings`, per technical spec §2.2 / §2.9.
      Apply it to the Neon database. **[Agent: nextjs-fullstack]**
- [x] Add `src/consts/auth.ts`: `DAILY_FORECAST_ALLOWANCE = 3`, `ROLE_USER`, `ROLE_ADMIN`,
      the `Role` union, `SESSION_MAX_AGE_SECONDS`, `ADMIN_PATH = '/admin'`. **[Agent: nextjs-fullstack]**
- [x] Add `next-auth@5` (exact pinned version) and env vars `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
      `AUTH_GOOGLE_SECRET`, `AUTH_URL` to `.env` and `.env.example`. **[Agent: nextjs-fullstack]**
- [x] Add Auth.js config (Google provider only, JWT strategy, 30-day rolling session, `signIn`
      callback upserting `public.users` by `google_sub` and returning `false` only on DB failure)
      and the `/api/auth/[...nextauth]` route handler. **[Agent: nextjs-fullstack]**
- [x] Add `src/lib/auth/session.ts` — `getCurrentUser()` resolving the session to the user row
      or null (one indexed read), server-only. **[Agent: nextjs-fullstack]**
- [x] Add `GET /api/me` (`dynamic = 'force-dynamic'`) returning `{ role, name, email, imageUrl,
      remaining, resetsAt }`; `remaining` null for guest, always HTTP 200. **[Agent: nextjs-fullstack]**
- [x] Add `src/hooks/useSession.ts` — SWR over `/api/me`, key `'me'`, no polling, revalidate
      on focus. **[Agent: nextjs-fullstack]**
- [x] Update `src/components/layout/Header.tsx`: `SignInButton` (guest, "Continue with Google",
      callback URL = current path) and `AccountMenu` (name, email, "Sign out"). **[Agent: nextjs-fullstack]**
- [ ] **Verify:** user signs in with a real Google account, is returned to the same screen
      signed in, sees name + email in the account menu, and signs out back to guest. Agent
      confirms exactly one `public.users` row was created and `curl /api/me` shows `guest`
      with no cookie and `user` with the session cookie. **[Agent: general-purpose]**

## Slice 2: A guest pressing Reforecast is invited to sign in

- [x] Add a sign-in invitation modal component (dialog + "Continue with Google" calling
      `signIn` with the current path). **[Agent: nextjs-fullstack]**
- [x] Update `src/components/panels/ChartPanel.tsx` and `ScenarioPanel.tsx`: when
      `useSession` role is `guest`, Reforecast stays enabled and un-greyed, and pressing it
      opens the modal instead of calling the API. No optimistic forecast after sign-in. **[Agent: nextjs-fullstack]**
- [ ] **Verify:** as a guest, press Reforecast — chart does not change, modal appears; sign in
      from the modal, land back on the same screen, press Reforecast again deliberately. **[Agent: general-purpose]**

## Slice 3: A signed-in person gets three forecasts a day, honestly counted

- [x] Add `src/lib/auth/allowance.ts` (pure): `remainingAllowance(usedCount, role)` (clamp at
      zero, null for admin), `allowanceWindowStart(now, resetAt)` (later of UTC midnight and
      `allowance_reset_at`), `nextResetAt(now)` (next 00:00 UTC). **[Agent: nextjs-fullstack]**
- [x] Add `src/lib/db/allowance.ts` (impure): `readUsage(userId)`, `recordUsage(userId,
      forecastAsOf)`, `restoreAllowance(userId)`. **[Agent: nextjs-fullstack]**
- [x] Add `src/lib/auth/authorize.ts` — `requireUser()` / `requireAdmin()` returning typed
      refusals (mirroring `src/lib/ingestAuth.ts`). **[Agent: nextjs-fullstack]**
- [x] Rewrite `POST /api/projections/refresh` per technical spec §2.6: `requireUser()` (401
      `reason: 'signin-required'`) → mock-mode short-circuit (no allowance touched) → role
      `user` reads remaining (null ⇒ 503, zero ⇒ 429 with `remaining: 0` + `resetsAt`; admin
      skips) → generate → on success only: `revalidateTag('projections')` then **awaited**
      `recordUsage` (failure logged, response still 200) → return projections + recomputed
      `remaining`. Delete the `checkAdminAuth` / `ADMIN_COOKIE_NAME` branch. **[Agent: nextjs-fullstack]**
- [x] Update `src/hooks/useProjections.ts`: rewrite `describeRefreshError` for the new
      contract (401 → "Sign in to reforecast", 429 → reads `resetsAt` and names the time,
      remove "Operator unlock required"); call `useSession` `mutate` after a successful
      reforecast. **[Agent: nextjs-fullstack]**
- [x] Update `ChartPanel.tsx` / `ScenarioPanel.tsx`: `user` label "Reforecast — n left today";
      at zero, press shows the exhausted message with reset time; `admin` label plain
      "Reforecast" with no count. Account menu repeats the count + reset time (hidden for admin). **[Agent: nextjs-fullstack]**
- [x] Add `src/scripts/allowance.test.ts` (`npx tsx`): clamping at zero, null for admin,
      `allowanceWindowStart` picking the later boundary, `nextResetAt` across a day / month /
      leap-day boundary, a 23:59 UTC usage not counting one minute later. Also cover
      `describeRefreshError` for each new status incl. 429 with and without `resetsAt`. **[Agent: nextjs-fullstack]**
- [ ] **Verify:** signed-in user presses 3× → 3 forecasts, chart redraws each time, 3
      `forecast_usage` rows, button counts 2/1/0. 4th press → 429 naming the reset time, still
      3 rows. Force a generation failure → 500, no 4th row. `npx tsx src/scripts/allowance.test.ts`
      passes. **[Agent: general-purpose]**

## Slice 4: An admin can see everyone and change what they can do

- [ ] First-admin bootstrap: sign in once, then `UPDATE public.users SET role='admin'` on that
      row directly in Neon. Record this in the deployment notes. **[Agent: general-purpose]**
- [x] Add root `middleware.ts` matching `/admin/:path*` only — cookie-presence check, redirect
      a session-less visitor into the Google flow with callback back to `/admin`. Note in code
      that this is not the authorization boundary. **[Agent: nextjs-fullstack]**
- [x] Add `GET /api/admin/users` (`requireAdmin()`: 401 guest, 403 user) → id, name, email,
      role, `created_at`, forecasts used today. **[Agent: nextjs-fullstack]**
- [x] Add `PATCH /api/admin/users/[id]/role` — new role in body; **409** when an admin targets
      their own row with `user`, body explaining the refusal. **[Agent: nextjs-fullstack]**
- [x] Add `src/app/(admin)/admin/page.tsx` (server component, `requireAdmin()`; signed-in
      non-admin → "you do not have access" + link to dashboard) and
      `src/components/pages/AdminPage.tsx` — table of everyone, per-row role control, inline
      self-demotion refusal. `useAdminUsers` SWR hook revalidated after each mutation. **[Agent: nextjs-fullstack]**
- [x] Add an admin-only "Admin" entry to `src/consts/nav.ts`, filtered out unless session role
      is admin. **[Agent: nextjs-fullstack]**
- [ ] **Verify:** admin loads `/admin` and sees the list; promotes then demotes another
      account and that account's role changes on its next `/api/me` with no sign-out; admin
      self-demotion returns 409 and inline message; a `user` hitting `/admin` gets the
      no-access state, a guest is sent to sign-in; nav shows "Admin" only for the admin. **[Agent: general-purpose]**

## Slice 5: An admin can restore someone's allowance for the day

- [x] Add `POST /api/admin/users/[id]/allowance` (`requireAdmin()`) — sets
      `allowance_reset_at = now()`, returns recomputed `remaining`. **[Agent: nextjs-fullstack]**
- [x] Add a "Restore allowance" action per row in `AdminPage.tsx`; the row's used-today count
      updates immediately. **[Agent: nextjs-fullstack]**
- [ ] **Verify:** exhaust a user's allowance, admin restores it, that user's button returns to
      "3 left today" and a 4th (now 1st) press succeeds. **[Agent: general-purpose]**

## Slice 6: Retire the shared operator credential

- [x] Delete `GET /api/admin/unlock`, `ADMIN_COOKIE_NAME` from `src/consts/projections.ts`,
      `src/lib/adminAuth.ts`'s cookie branch, and every cookie-branch caller. Keep
      `matchesAdminSecret` only if `checkIngestAuth` still uses it; remove `ADMIN_SECRET` from
      env + `.env.example`. **[Agent: nextjs-fullstack]**
- [x] Remove the `FORECAST_DAILY_CALL_LIMIT` block and `getDailyForecastGenerationCount()`
      call from the refresh route; delete `getDailyForecastGenerationCount` from
      `src/lib/db/analytics.ts` unless another caller remains. **[Agent: nextjs-fullstack]**
- [x] Move the news-classification pause into `public.app_settings`:
      `isNewsClassificationPaused()` reads the row and falls back to `NEWS_CLASSIFY_ENABLED`
      when absent; used by `src/lib/freshness.ts` and `/api/collect`. Add
      `PATCH /api/admin/settings/news-pause` (`requireAdmin()`) writing `value` + `updated_by`. **[Agent: nextjs-fullstack]**
- [x] Add to `AdminPage.tsx`: the news-pause toggle, and an operator panel rendering the
      `GET /api/health` payload with per-collector detail (`/api/health` itself stays
      unauthenticated and unchanged). **[Agent: nextjs-fullstack]**
- [ ] **Verify:** `curl /api/admin/unlock` → 404; holding the old `ADMIN_SECRET` with no
      session grants nothing beyond guest; admin toggles news-pause and `/api/collect` honours
      the row; admin panel shows health detail; `curl /api/health` still 200/503 unauthenticated. **[Agent: general-purpose]**

## Slice 7: Confirm nothing else changed, and update the contradicted documents

- [x] Guest sweep: with no session cookie, load projections, markets, signals, models and the
      watchlist; confirm each renders as today and a stored forecast is still served to a
      guest. **[Agent: general-purpose]**
- [x] Update `context/product/product-definition.md` §3.2 and §3.3, `context/product/roadmap.md`
      ("Explicitly Not On This Roadmap"), `context/product/architecture.md` §3.1 auth column and
      §6, and cross-reference `context/spec/019-forecast-cost-control/functional-spec.md` §3 as
      superseded. **[Agent: general-purpose]**
- [x] Final `npx tsc --noEmit` and `npm run lint` clean. **[Agent: nextjs-fullstack]**

---

## Recommendations

| Task / Slice | Issue | Recommendation |
|---|---|---|
| Every slice verification sub-task | Assigned to `general-purpose` — no manual-QA / integration-test agent is installed | Install a `manual-qa` agent, or the user drives the browser + OAuth checks personally (agreed) and an agent handles the `curl` / SQL parts |
| SQL migration `0010_accounts.sql` | No dedicated database/migration agent; handled by `nextjs-fullstack` | Acceptable for this project (Neon is used directly from the Next.js layer); consider a `db-migration` agent if schema work grows |
| OAuth flow verification (Slices 1–2) | No browser MCP connected in this session | User connects a browser and completes the Google flow (agreed); agents cannot complete OAuth |
