import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton';
import { Card, CardHeader } from '@/components/ui';

export function ChartPanelSkeleton() {
  return (
    <Card glow className="animate-pulse [grid-area:chart] max-sm:p-3">
      <CardHeader>
        <div className="bg-surface-3 h-3.5 w-2/5 rounded-sm" />
      </CardHeader>
      <div className="mt-3">
        <ChartSkeleton />
      </div>
    </Card>
  );
}
