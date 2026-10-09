import type { AdminUser } from '@/hooks/useAdminUsers';

import { AdminTable } from './AdminTable';
import { AdminTd } from './AdminTd';
import { AllowanceControl } from './AllowanceControl';
import { RoleControl } from './RoleControl';
import { formatDate } from './utils';

const USER_COLUMNS = ['Name', 'Email', 'Role', 'First signed in', 'Forecasts today', 'Allowance'];

export function UsersTable({
  users,
  onChanged,
}: {
  users: AdminUser[];
  onChanged: () => Promise<unknown>;
}) {
  return (
    <AdminTable columns={USER_COLUMNS}>
      {users.map((user) => (
        <tr key={user.id}>
          <AdminTd>{user.name ?? '—'}</AdminTd>
          <AdminTd tone="small">{user.email}</AdminTd>
          <AdminTd>
            <RoleControl user={user} onChanged={onChanged} />
          </AdminTd>
          <AdminTd tone="muted">{formatDate(user.createdAt)}</AdminTd>
          <AdminTd className="tabular-nums">{user.forecastsToday}</AdminTd>
          <AdminTd>
            <AllowanceControl user={user} onChanged={onChanged} />
          </AdminTd>
        </tr>
      ))}
      {users.length === 0 && (
        <tr>
          <AdminTd tone="muted" colSpan={6}>
            Nobody has signed in yet.
          </AdminTd>
        </tr>
      )}
    </AdminTable>
  );
}
