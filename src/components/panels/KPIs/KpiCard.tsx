import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { Skeleton } from '@/components/ui';
import type { KpiItem } from '@/data/types';

interface KpiCardProps {
  item: KpiItem;
  isLoading: boolean;
}

export function KpiCard({ item, isLoading }: KpiCardProps) {
  const { sparkline } = item;

  return (
    <div className="border-line relative flex flex-col gap-2 border-r px-6 py-4 last:border-r-0 max-lg:nth-2:border-r-0 max-lg:nth-[-n+2]:border-b max-sm:px-4 max-sm:py-3">
      {/* Wraps instead of truncating; right padding clears the absolutely-positioned sparkline. */}
      <div className="text-text-3 pr-19.5 text-xs leading-(--lh-snug) tracking-(--ls-label) uppercase">
        {item.lbl}
      </div>

      {isLoading ? (
        <>
          <Skeleton className="mb-1 h-6 w-24" />
          <Skeleton tone="subtle" className="h-4 w-16" />
        </>
      ) : (
        <>
          <div className="overflow-hidden text-xl font-medium tracking-(--ls-tight) text-ellipsis whitespace-nowrap tabular-nums max-[390px]:text-base max-sm:text-lg">
            {item.val}
          </div>
          <div className="text-text-2 flex flex-wrap items-center gap-2 text-xs">
            {/* `deltaClass` is a legacy class string supplied by the data layer. */}
            <span className={item.deltaClass}>{item.deltaText}</span>
            {item.subText && <span className="text-text-3">{item.subText}</span>}
          </div>
        </>
      )}

      {sparkline && sparkline.length > 0 && (
        <div className="absolute top-4.5 right-4.5 h-7 w-17.5 opacity-85 max-sm:opacity-55">
          <SparklineChart
            prices={sparkline}
            isPositive={sparkline.length > 1 && sparkline[sparkline.length - 1] >= sparkline[0]}
          />
        </div>
      )}
    </div>
  );
}
