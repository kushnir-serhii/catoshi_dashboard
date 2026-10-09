import { useState } from 'react';

import { Button } from '@/components/ui';
import { ROLE_ADMIN } from '@/consts/auth';
import type { AdminUser } from '@/hooks/useAdminUsers';

import { ErrorText } from './ErrorText';

export function AllowanceControl({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An admin has no allowance to restore.
  if (user.role === ROLE_ADMIN) {
    return null;
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/allowance`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Restore failed (${res.status})`);
        return;
      }
      await onChanged();
    } catch {
      setError('Restore failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        disabled={pending}
        onClick={() => {
          void submit();
        }}
      >
        {pending ? 'Restoring…' : 'Restore allowance'}
      </Button>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
