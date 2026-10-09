import { Badge, Button } from '@/components/ui';
import type { WatchlistCoin } from '@/hooks/useWatchlist';

interface WatchlistCoinRowProps {
  coin: WatchlistCoin;
  onRemove: (id: string) => void;
}

export function WatchlistCoinRow({ coin, onRemove }: WatchlistCoinRowProps) {
  return (
    <div className="bg-surface-2 border-surface-3 flex items-center gap-3 rounded border p-3">
      <Badge className="shrink-0 py-0.5 font-semibold tracking-normal">
        {coin.symbol.toUpperCase()}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-sm">{coin.name}</span>
      <Button
        variant="icon"
        className="text-text-2 shrink-0 text-sm"
        onClick={() => onRemove(coin.id)}
        aria-label={`Remove ${coin.name} from watchlist`}
      >
        ×
      </Button>
    </div>
  );
}
