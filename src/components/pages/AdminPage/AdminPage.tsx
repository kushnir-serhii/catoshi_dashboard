'use client';

import { Skeleton } from '@/components/ui';
import { useAdminUsers } from '@/hooks/useAdminUsers';

import { AdminBox } from './AdminBox';
import { AdminSection } from './AdminSection';
import { ErrorText } from './ErrorText';
import { NewsPausePanel } from './NewsPausePanel';
import { OperatorHealthPanel } from './OperatorHealthPanel';
import { UsersTable } from './UsersTable';

export function AdminPage() {
  const { users, isLoading, isError, mutate } = useAdminUsers();

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-4">
      <h1 className="sr-only">Administration</h1>
      <AdminSection title="Everyone who has signed in">
        {isLoading ? (
          <AdminBox>
            <Skeleton className="h-3.5 w-55" />
          </AdminBox>
        ) : isError ? (
          <AdminBox>
            <ErrorText>
              The user list could not be read. This is not a measured result — check back shortly.
            </ErrorText>
          </AdminBox>
        ) : (
          <AdminBox className="overflow-x-auto">
            <UsersTable users={users} onChanged={() => mutate()} />
          </AdminBox>
        )}
      </AdminSection>

      <NewsPausePanel />
      <OperatorHealthPanel />
    </div>
  );
}
