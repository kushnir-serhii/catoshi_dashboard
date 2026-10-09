import { Card, CardHeader, CardTitle, Muted, Skeleton } from '@/components/ui';
import type { CoinListItem } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { isTodayTracked } from '@/lib/todayUi';

import { OkBody } from './OkBody';
import { UnavailableMessage } from './UnavailableMessage';
import { useNow } from './useNow';

interface TodayCardProps {
  coin: CoinListItem;
  showLevel: boolean;
  isPreview: boolean;
}

export function TodayCard({ coin, showLevel, isPreview }: TodayCardProps) {
  const tracked = isTodayTracked(coin.id);
  const { data, error, isLoading } = useToday(tracked ? coin.id : null);
  const now = useNow();

  return (
    <Card className="flex min-w-0 flex-col [grid-area:today] max-sm:p-3">
      <CardHeader className="max-sm:mb-3">
        <CardTitle marker="violet">Today · {coin.symbol.toUpperCase()}</CardTitle>
        {isPreview && (
          <span className="border-warning text-warning rounded-pill border px-2 py-0.5 text-xs">
            Uncalibrated preview — not a verdict
          </span>
        )}
      </CardHeader>
      {!tracked ? (
        <Muted as="p">Today range is available for BTC, ETH and SOL.</Muted>
      ) : isLoading ? (
        <Skeleton
          className="h-35"
          aria-hidden={undefined}
          aria-busy="true"
          aria-label="Loading today range"
        />
      ) : error || data === null ? (
        <Muted as="p">Intraday data unavailable right now.</Muted>
      ) : data.status === 'unavailable' ? (
        <UnavailableMessage data={data} />
      ) : (
        <OkBody data={data} now={now} showLevel={showLevel} />
      )}
      <Muted as="p" size="xs" className="mt-4">
        Model estimate from recent volatility. Not a direction call. Not financial advice.
      </Muted>
    </Card>
  );
}
