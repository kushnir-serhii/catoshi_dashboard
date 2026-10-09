import { cn } from '@/utils/cn';

interface BurgerButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

// Bar offsets closed: 12 / 16 / 20px. Open: outer bars meet at 16px and cross into an X.
const BARS = [
  { closed: 'top-3', open: 'top-4 rotate-45' },
  { closed: 'top-4', open: 'top-4 opacity-0' },
  { closed: 'top-5', open: 'top-4 -rotate-45' },
] as const;

export const BurgerButton: React.FC<BurgerButtonProps> = ({ isOpen, onToggle }) => (
  <button
    type="button"
    className="hover:bg-surface-2 relative hidden size-8.5 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent bg-transparent max-[1024px]:inline-flex pointer-coarse:h-auto pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    aria-label={isOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={isOpen}
    aria-controls="mobile-menu"
    onClick={onToggle}
  >
    {BARS.map((bar, i) => (
      <span
        key={i}
        className={cn(
          'bg-text-2 absolute left-2 h-0.5 w-4.5 rounded-sm transition-[transform,opacity,top] duration-(--dur-base) ease-in-out motion-reduce:transition-none',
          isOpen ? bar.open : bar.closed,
        )}
      />
    ))}
  </button>
);
