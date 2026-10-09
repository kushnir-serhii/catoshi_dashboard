import { Button, Input } from '@/components/ui';

interface SaveSnapshotPopoverProps {
  placeholder: string;
  name: string;
  onNameChange: (name: string) => void;
  error: string | null;
  onConfirm: () => void;
  /** Close the prompt and discard the draft name. */
  onCancel: () => void;
}

export function SaveSnapshotPopover({
  placeholder,
  name,
  onNameChange,
  error,
  onConfirm,
  onCancel,
}: SaveSnapshotPopoverProps) {
  return (
    <div className="border-surface-3 bg-surface-2 shadow-raised absolute top-[calc(100%+6px)] right-0 z-(--z-popover) flex min-w-55 flex-col gap-2 rounded border p-3">
      <Input
        autoFocus
        variant="raised"
        placeholder={placeholder}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
      />
      {error && <span className="text-red text-xs">{error}</span>}
      <div className="flex gap-2">
        <Button
          variant="subtle"
          size="sm"
          className="flex-1 border px-0 py-1 text-sm font-normal"
          onClick={onConfirm}
        >
          Save
        </Button>
        <Button className="py-1 text-sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
