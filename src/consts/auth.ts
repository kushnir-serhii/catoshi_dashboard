/**
 * Identity and per-person reforecast allowance constants (spec 022).
 *
 * Shared across the Auth.js config, the server-side session/allowance helpers,
 * the guarded Route Handlers and the header UI — so per the project's constants
 * rule they live here rather than inline.
 */

/** Successful forecasts a signed-in `user` may produce per UTC day. */
export const DAILY_FORECAST_ALLOWANCE = 3;

/** Role values, matching the `users_role_check` constraint in migration 0010. */
export const ROLE_USER = 'user';
export const ROLE_ADMIN = 'admin';

/** The two roles a `public.users` row can hold. */
export type Role = typeof ROLE_USER | typeof ROLE_ADMIN;

/**
 * Rolling JWT session lifetime — 30 days in seconds. Satisfies "closing the
 * browser and returning later leaves me still signed in" (functional spec §2.1).
 */
export const SESSION_MAX_AGE_SECONDS = 2_592_000;

/** Base path of the admin-only administration area. */
export const ADMIN_PATH = '/admin';
