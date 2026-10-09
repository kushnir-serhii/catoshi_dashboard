import { CardBox } from './CardBox';
import { ModelsCard } from './ModelsCard';

export function PageSkeleton() {
  return (
    <ModelsCard title="Forecast accuracy">
      <CardBox className="animate-pulse">
        <div className="bg-surface-3 mb-4 h-3.5 w-40 rounded-sm" />
        <div className="bg-surface-3 mb-3 h-10 w-55 rounded-sm" />
        <div className="bg-surface-3 h-15 w-full rounded-sm" />
      </CardBox>
    </ModelsCard>
  );
}
