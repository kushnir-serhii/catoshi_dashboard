import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import { SESSION_MAX_AGE_SECONDS } from '@/consts/auth';
import { query } from '@/lib/db/client';

/**
 * Auth.js v5 configuration (spec 022).
 *
 * - Google is the ONLY provider. No email/password, no credentials, no magic link.
 * - JWT session strategy — no database session table. The token carries the
 *   internal `public.users.id` and nothing else; role and allowance are read
 *   fresh from Postgres on every guarded call, so a promotion/demotion takes
 *   effect on the person's next request without a sign-out.
 * - 30-day rolling session.
 *
 * This module is server-only. It must never be imported into a client component;
 * the client learns who it is from `GET /api/me` alone.
 */

interface UserIdRow {
  id: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    /**
     * Upsert `public.users` on every sign-in, keyed by Google's stable `sub`.
     * Returns `false` ONLY on a database failure — an account is never created
     * twice, and a broken database never produces a half-signed-in person.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== 'google' || !profile?.sub) {
        return false;
      }
      try {
        await query(
          `insert into public.users (google_sub, email, name, image_url)
           values ($1, $2, $3, $4)
           on conflict (google_sub) do update set
             email = excluded.email,
             name = excluded.name,
             image_url = excluded.image_url,
             last_seen_at = now()`,
          [
            profile.sub,
            profile.email ?? '',
            profile.name ?? null,
            typeof profile.picture === 'string' ? profile.picture : null,
          ],
        );
        return true;
      } catch (error: unknown) {
        console.error('[auth] signIn user upsert failed:', error);
        return false;
      }
    },

    /**
     * Stamp the internal numeric user id onto the token on first issue. The
     * role is deliberately NOT carried here.
     */
    async jwt({ token, profile }) {
      if (profile?.sub) {
        try {
          const rows = await query<UserIdRow>(`select id from public.users where google_sub = $1`, [
            profile.sub,
          ]);
          if (rows[0]) {
            token.uid = Number(rows[0].id);
          }
        } catch (error: unknown) {
          console.error('[auth] jwt user id lookup failed:', error);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (typeof token.uid === 'number') {
        session.appUserId = token.uid;
      }
      return session;
    },
  },
});
