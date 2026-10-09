import { useState } from 'react';

import { Button } from '@/components/ui';
import { ROLE_ADMIN, ROLE_USER } from '@/consts/auth';
import type { AdminUser } from '@/hooks/useAdminUsers';

import { ErrorText } from './ErrorText';
import { StatusPill } from './StatusPill';

export function RoleControl({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextRole = user.role === ROLE_ADMIN ? ROLE_USER : ROLE_ADMIN;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 409 self-demotion refusal (and any other refusal): surface inline,
        // leave the control unchanged.
        setError(body.error ?? `Change failed (${res.status})`);
        return;
      }
      await onChanged();
    } catch {
      setError('Change failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <StatusPill className="text-text-3 px-2">{user.role}</StatusPill>
      <Button
        className="ml-2"
        disabled={pending}
        onClick={() => {
          void submit();
        }}
      >
        {pending ? 'Saving…' : `Make ${nextRole}`}
      </Button>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
