import { Badge, Button, Input, Muted } from '@/components/ui';
import type { ForecastSnapshot } from '@/data/types';

interface SnapshotRowProps {
  snapshot: ForecastSnapshot;
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onLoad: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}

export function SnapshotRow({
  snapshot: snap,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onLoad,
  onRemove,
}: SnapshotRowProps) {
  return (
    <div className="bg-surface-2 border-surface-3 flex items-center gap-3 rounded border p-3">
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <Input
            variant="edit"
            autoFocus
            className="focus-visible:outline-0"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
          />
        ) : (
          <span
            onClick={onStartRename}
            title="Click to rename"
            className="block cursor-text truncate text-sm font-medium"
          >
            {snap.name}
          </span>
        )}
        <Muted size="xs" className="leading-(--lh-normal)">
          {snap.service} · {snap.model} · {new Date(snap.savedAt).toLocaleDateString()}
        </Muted>
      </div>
      <Badge className="shrink-0 py-0.5 font-semibold tracking-normal">{snap.coin}</Badge>
      <Button className="shrink-0 py-1 text-sm" onClick={() => onLoad(snap.id)}>
        Load
      </Button>
      <Button
        variant="icon"
        className="text-text-2 shrink-0 text-sm leading-[inherit]"
        onClick={() => void onRemove(snap.id)}
        aria-label={`Delete snapshot ${snap.name}`}
      >
        ×
      </Button>
    </div>
  );
}
