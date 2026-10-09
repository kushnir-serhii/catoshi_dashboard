import { Skeleton } from '@/components/ui';

import { SignalCardShell } from './SignalCardShell';

export function SignalCardSkeleton() {
  return (
    <SignalCardShell>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-14" />
        <Skeleton className="h-3 w-18" />
      </div>
      <Skeleton className="h-7.5" />
    </SignalCardShell>
  );
}
