'use client';

import { useCallback, useEffect, useState } from 'react';

import { Modal } from '@/components/ui';
import type { ForecastSnapshot } from '@/data/types';
import { CLAUDE_MODELS, OPENAI_MODELS } from '@/hooks/useForecastSettings';
import { describeRefreshError } from '@/hooks/useProjections';

import { ApplyActions } from './ApplyActions';
import { ModelPicker } from './ModelPicker';
import type { ForecastService } from './ProviderPicker';
import { ProviderPicker } from './ProviderPicker';
import { SnapshotList } from './SnapshotList';

interface ForecastSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ForecastService;
  model: string;
  setServiceAndModel: (s: ForecastService, m: string) => void;
  refresh: (service: string, model: string) => Promise<void>;
  snapshots: ForecastSnapshot[];
  onLoadSnapshot: (id: string) => void;
  onRenameSnapshot: (id: string, name: string) => Promise<void>;
  onRemoveSnapshot: (id: string) => Promise<void>;
}

export function ForecastSettingsModal({
  isOpen,
  onClose,
  service,
  model,
  setServiceAndModel,
  refresh,
  snapshots,
  onLoadSnapshot,
  onRenameSnapshot,
  onRemoveSnapshot,
}: ForecastSettingsModalProps) {
  const [localService, setLocalService] = useState<ForecastService>(service);
  const [localModel, setLocalModel] = useState<string>(model);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (!isApplying) onClose();
  }, [isApplying, onClose]);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalService(service);
      setLocalModel(model);
      setApplyError(null);
    }
  }, [isOpen, service, model]);

  function handleServiceChange(s: ForecastService) {
    setLocalService(s);
    setApplyError(null);
    // Returning to the committed provider restores its committed model;
    // any other provider falls back to its first model.
    if (s === service) {
      setLocalModel(model);
      return;
    }
    setLocalModel(s === 'claude' ? CLAUDE_MODELS[0].id : OPENAI_MODELS[0].id);
  }

  function handleModelChange(m: string) {
    setLocalModel(m);
    setApplyError(null);
  }

  async function handleApply() {
    setIsApplying(true);
    setApplyError(null);
    try {
      setServiceAndModel(localService, localModel);
      await refresh(localService, localModel);
      onClose();
    } catch (err) {
      setApplyError(describeRefreshError(err));
    } finally {
      setIsApplying(false);
    }
  }

  const activeModels = localService === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="AI forecast settings"
      closeLabel="Close settings"
      gap={5}
      dismissable={!isApplying}
      closeDisabled={isApplying}
    >
      <ProviderPicker value={localService} onChange={handleServiceChange} />
      <ModelPicker models={activeModels} value={localModel} onChange={handleModelChange} />
      <ApplyActions isApplying={isApplying} error={applyError} onApply={handleApply} />
      <SnapshotList
        snapshots={snapshots}
        onLoad={(id) => {
          onLoadSnapshot(id);
          onClose();
        }}
        onRename={onRenameSnapshot}
        onRemove={onRemoveSnapshot}
      />
    </Modal>
  );
}
