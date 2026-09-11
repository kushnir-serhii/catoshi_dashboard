import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/pages';
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
      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="marker"></span>Administration
            </div>
          </div>
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: 12,
              background: 'var(--surface-2)',
              border: '1px solid var(--surface-3)',
            }}
          >
            <h4 style={{ fontSize: 'var(--fs-md)', marginBottom: 8, color: 'var(--text)' }}>
              You do not have access
            </h4>
            <p
              className="small muted"
              style={{ margin: '0 auto 16px', maxWidth: 420, lineHeight: 1.6 }}
            >
              The administration area is available to admins only.
            </p>
            <Link className="btn btn-ghost" href="/projections">
              Back to the dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminPage />;
}
