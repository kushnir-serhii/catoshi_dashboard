import { cn } from '@/utils/cn';

interface ProjectionBarProps {
  /** 0-100. Omit for an empty track (no forecast). */
  confidence?: number;
  positive?: boolean;
  className?: string;
}

export function ProjectionBar({ confidence, positive = false, className }: ProjectionBarProps) {
  return (
    <div className={cn('rounded-pill bg-surface-3 relative h-1.5 w-27.5', className)}>
      <div className="bg-line-2 absolute inset-y-[-3px] left-1/2 w-px" />
      {confidence !== undefined && (
        <div
          className={cn(
            'rounded-pill absolute h-full',
            positive
              ? 'bg-green shadow-[0_0_var(--glow-sm)_var(--color-green)]'
              : 'bg-violet shadow-[0_0_var(--glow-sm)_var(--color-violet)]',
          )}
          style={{ width: `${confidence}%` }}
        />
      )}
    </div>
  );
}
