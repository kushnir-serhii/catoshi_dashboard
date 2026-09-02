'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@heroui/react';
import { CLAUDE_MODELS, OPENAI_MODELS } from '@/hooks/useForecastSettings';
import type { ForecastSnapshot } from '@/data/types';

interface ForecastSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: 'claude' | 'openai';
  model: string;
  setService: (s: 'claude' | 'openai') => void;
  setModel: (m: string) => void;
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
  setService,
  setModel,
  refresh,
  snapshots,
  onLoadSnapshot,
  onRenameSnapshot,
  onRemoveSnapshot,
}: ForecastSettingsModalProps) {
  const [localService, setLocalService] = useState<'claude' | 'openai'>(service);
  const [localModel, setLocalModel] = useState<string>(model);
  const [isApplying, setIsApplying] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleClose = useCallback(() => {
    if (!isApplying) onClose();
  }, [isApplying, onClose]);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalService(service);
      setLocalModel(model);
    }
  }, [isOpen, service, model]);

  function handleServiceChange(s: 'claude' | 'openai') {
    setLocalService(s);
    const firstModel = s === 'claude' ? CLAUDE_MODELS[0].id : OPENAI_MODELS[0].id;
    setLocalModel(firstModel);
  }

  async function handleApply() {
    setIsApplying(true);
    try {
      setService(localService);
      setModel(localModel);
      await refresh(localService, localModel);
      onClose();
    } finally {
      setIsApplying(false);
    }
  }

  const activeModels = localService === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS;

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) handleClose(); }}
      isDismissable={!isApplying}
      className="modal__backdrop"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
    >
        <Modal.Container className="modal__container max-w-115">
          <Modal.Dialog className="modal__dialog card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="card-title" style={{ fontSize: 15, fontWeight: 600 }}>
                <span className="marker" />
                AI forecast settings
              </span>
              <Modal.CloseTrigger
                className="btn-ghost"
                aria-label="Close settings"
                style={{ fontSize: 18, lineHeight: 1, padding: '2px 8px', opacity: isApplying ? 0.4 : 1, pointerEvents: isApplying ? 'none' : 'auto' }}
              />
            </div>

            {/* Section 1: AI Provider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                AI provider
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['claude', 'openai'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleServiceChange(s)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: 'var(--radius)',
                      border: localService === s
                        ? '1.5px solid oklch(0.78 0.22 295)'
                        : '1.5px solid var(--surface-3)',
                      background: localService === s
                        ? 'oklch(0.78 0.22 295 / 0.12)'
                        : 'var(--surface-2)',
                      color: localService === s ? 'oklch(0.78 0.22 295)' : 'var(--text-2)',
                      fontWeight: localService === s ? 600 : 400,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                    }}
                  >
                    {s === 'claude' ? 'Claude' : 'OpenAI'}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Model */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                Model
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setLocalModel(m.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 100,
                      border: localModel === m.id
                        ? '1.5px solid oklch(0.78 0.22 295)'
                        : '1.5px solid var(--surface-3)',
                      background: localModel === m.id
                        ? 'oklch(0.78 0.22 295 / 0.12)'
                        : 'var(--surface-2)',
                      color: localModel === m.id ? 'oklch(0.78 0.22 295)' : 'var(--text-2)',
                      fontWeight: localModel === m.id ? 600 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply button */}
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="btn-ghost"
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 'var(--radius)',
                background: isApplying ? 'var(--surface-3)' : 'oklch(0.78 0.22 295 / 0.15)',
                border: '1.5px solid oklch(0.78 0.22 295)',
                color: 'oklch(0.78 0.22 295)',
                fontWeight: 600,
                fontSize: 14,
                cursor: isApplying ? 'not-allowed' : 'pointer',
                opacity: isApplying ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {isApplying ? 'Applying…' : 'Apply & refresh'}
            </button>

            {/* Section 3: Saved Forecasts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                Saved forecasts
              </span>
              {snapshots.length === 0 ? (
                <span className="muted small" style={{ fontSize: 12 }}>No saved forecasts yet</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--surface-3)',
                        borderRadius: 'var(--radius)',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {renamingId === snap.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              void onRenameSnapshot(snap.id, renameValue.trim() || snap.name);
                              setRenamingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void onRenameSnapshot(snap.id, renameValue.trim() || snap.name);
                                setRenamingId(null);
                              }
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            style={{
                              width: '100%',
                              background: 'var(--surface-3)',
                              border: '1px solid oklch(0.78 0.22 295)',
                              borderRadius: 4,
                              color: 'var(--text)',
                              fontSize: 16,
                              padding: '4px 6px',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => { setRenamingId(snap.id); setRenameValue(snap.name); }}
                            title="Click to rename"
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: 'text',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                            }}
                          >
                            {snap.name}
                          </span>
                        )}
                        <span className="muted small" style={{ fontSize: 11 }}>
                          {snap.service} · {snap.model} · {new Date(snap.savedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 100,
                          background: 'var(--surface-3)',
                          color: 'var(--text-2)',
                          flexShrink: 0,
                        }}
                      >
                        {snap.coin}
                      </span>
                      <button
                        className="btn-ghost"
                        onClick={() => { onLoadSnapshot(snap.id); onClose(); }}
                        style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
                      >
                        Load
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => void onRemoveSnapshot(snap.id)}
                        aria-label={`Delete snapshot ${snap.name}`}
                        style={{ fontSize: 14, padding: '2px 8px', flexShrink: 0, color: 'var(--text-2)' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal.Dialog>
        </Modal.Container>
    </Modal.Backdrop>
  );
}
