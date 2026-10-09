import { useState } from 'react';

import { Button, Muted, Skeleton } from '@/components/ui';
import { useNewsPause } from '@/hooks/useAdminSettings';
import { cn } from '@/utils/cn';

import { AdminBox } from './AdminBox';
import { AdminSection } from './AdminSection';
import { ErrorText } from './ErrorText';
import { StatusPill } from './StatusPill';

export function NewsPausePanel() {
  const { paused, isLoading, isError, mutate } = useNewsPause();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/news-pause', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Change failed (${res.status})`);
        return;
      }
      await mutate();
    } catch {
      setError('Change failed — please try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminSection title="News classification">
      <AdminBox>
        {isLoading ? (
          <Skeleton className="h-3.5 w-50" />
        ) : isError || paused === null ? (
          <ErrorText>The current state could not be read. Check back shortly.</ErrorText>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill className={cn(paused ? 'text-red' : 'text-green')}>
              {paused ? 'paused' : 'running'}
            </StatusPill>
            <Muted>
              {paused
                ? 'No new headlines are being classified. Ingest and publishing of already-classified items continue.'
                : 'Unattended classification runs on the hourly collection pass.'}
            </Muted>
            <Button
              disabled={pending}
              onClick={() => {
                void toggle(!paused);
              }}
            >
              {pending ? 'Saving…' : paused ? 'Resume classification' : 'Pause classification'}
            </Button>
          </div>
        )}
        {error && <ErrorText className="mt-2">{error}</ErrorText>}
      </AdminBox>
    </AdminSection>
  );
}
