import { useState } from 'react';

import { Muted } from '@/components/ui';
import type { ForecastSnapshot } from '@/data/types';

import { ModalSection } from '../ModalSection';
import { SnapshotRow } from './SnapshotRow';

interface SnapshotListProps {
  snapshots: ForecastSnapshot[];
  onLoad: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function SnapshotList({ snapshots, onLoad, onRename, onRemove }: SnapshotListProps) {
  // One rename at a time: the list owns which row is being edited and its draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <ModalSection label="Saved forecasts">
      {snapshots.length === 0 ? (
        <Muted>No saved forecasts yet</Muted>
      ) : (
        <div className="flex flex-col gap-2">
          {snapshots.map((snap) => (
            <SnapshotRow
              key={snap.id}
              snapshot={snap}
              isRenaming={renamingId === snap.id}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onStartRename={() => {
                setRenamingId(snap.id);
                setRenameValue(snap.name);
              }}
              onCommitRename={() => {
                void onRename(snap.id, renameValue.trim() || snap.name);
                setRenamingId(null);
              }}
              onCancelRename={() => setRenamingId(null)}
              onLoad={onLoad}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </ModalSection>
  );
}
