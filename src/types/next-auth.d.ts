import '@auth/core/jwt';
import '@auth/core/types';

declare module '@auth/core/types' {
  interface Session {
    /** Internal `public.users.id` resolved from the JWT (spec 022). */
    appUserId?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    /** Internal `public.users.id` — the only identity claim in the token. */
    uid?: number;
  }
}
