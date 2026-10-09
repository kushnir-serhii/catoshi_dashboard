import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';

interface ApplyActionsProps {
  isApplying: boolean;
  error: string | null;
  onApply: () => void;
}

export function ApplyActions({ isApplying, error, onApply }: ApplyActionsProps) {
  return (
    <>
      <Button
        variant="subtle"
        fullWidth
        onClick={onApply}
        disabled={isApplying}
        className={cn('py-3', isApplying && 'bg-surface-3 disabled:opacity-70')}
      >
        {isApplying ? 'Applying…' : 'Apply & refresh'}
      </Button>
      {error && <span className="text-red -mt-2 text-center text-sm">{error}</span>}
    </>
  );
}
