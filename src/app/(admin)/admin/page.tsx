import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/pages';
import { buttonVariants, Card, CardHeader, CardTitle, Muted } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/authorize';

export const metadata: Metadata = {
  title: 'Catoshi — Administration',
  description: 'Manage who has signed in and what they can do.',
};

// Role is read fresh from Postgres on every request, so this must never cache.
export const dynamic = 'force-dynamic';

/**
 * The administration area (spec 022 §2.5 / §2.7).
 *
 * `requireAdmin()` is the real authorization boundary — the root `middleware.ts`
 * only does a cookie-presence check and cannot know a role. Defensive here:
 * a guest is sent to the Google sign-in flow, a signed-in non-admin gets an
 * explicit "no access" state with a link back to the dashboard.
 */
export default async function Page() {
  const result = await requireAdmin();

  if (!result.ok) {
    if (result.status === 401) {
      redirect('/api/auth/signin?callbackUrl=/admin');
    }
    return (
      <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle marker="violet">Administration</CardTitle>
          </CardHeader>
          <div className="border-surface-3 bg-surface-2 rounded-lg border px-6 py-12 text-center">
            <h4 className="text-text mb-2 text-base">You do not have access</h4>
            <Muted as="p" className="mx-auto mb-4 max-w-105">
              The administration area is available to admins only.
            </Muted>
            <Link className={buttonVariants({ variant: 'ghost' })} href="/projections">
              Back to the dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <AdminPage />;
}
