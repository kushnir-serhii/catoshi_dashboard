import { handlers } from '@/auth';

/**
 * Auth.js v5 catch-all handler (spec 022): sign-in, Google callback, sign-out
 * and the session endpoint. Unauthenticated by nature — this is how a visitor
 * becomes signed in.
 */
export const { GET, POST } = handlers;
