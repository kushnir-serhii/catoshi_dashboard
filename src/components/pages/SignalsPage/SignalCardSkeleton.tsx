import { Skeleton } from '@/components/ui';

export function SignalCardSkeleton() {
  return (
    <div className="border-line bg-surface relative flex flex-col gap-2 overflow-hidden rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-3.5 w-15" />
        <Skeleton className="ml-2 h-3 w-20" />
      </div>
      <Skeleton className="mb-2 h-4 w-4/5" />
      <Skeleton className="mb-1 h-3 w-[95%]" />
      <Skeleton className="mb-3 h-3 w-[70%]" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-25" />
      </div>
    </div>
  );
}
