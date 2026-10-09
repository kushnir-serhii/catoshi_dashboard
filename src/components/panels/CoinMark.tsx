import { cn } from '@/utils/cn';

/** Brand gradient per known ticker. Unknown tickers render an unfilled mark. */
const MARK_STYLES: Record<string, string> = {
  btc: 'bg-[linear-gradient(135deg,oklch(0.7_0.18_60),oklch(0.5_0.18_50))] text-[#1a0e02]',
  eth: 'bg-[linear-gradient(135deg,#6b7afd,#2a2eaa)] text-[#fff]',
  sol: 'bg-[linear-gradient(135deg,var(--color-violet),oklch(0.5_0.22_145))] text-[#fff]',
  link: 'bg-[linear-gradient(135deg,#2c5cff,#0d2787)] text-[#fff]',
  arb: 'bg-[linear-gradient(135deg,#28a0f0,#103752)] text-[#fff]',
  tao: 'bg-[linear-gradient(135deg,#d3d3df,#6e6e80)] text-[#1a1a26]',
};

interface CoinMarkProps {
  symbol: string;
}

/** Small square avatar showing a coin's first letter. */
export function CoinMark({ symbol }: CoinMarkProps) {
  return (
    <div
      className={cn(
        'grid size-6.5 shrink-0 place-items-center rounded-sm text-xs font-semibold',
        MARK_STYLES[symbol.toLowerCase()],
      )}
    >
      {symbol.slice(0, 1)}
    </div>
  );
}
