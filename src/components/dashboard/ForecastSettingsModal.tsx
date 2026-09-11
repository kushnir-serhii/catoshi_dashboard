'use client';

import { Modal } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import type { ForecastSnapshot } from '@/data/types';
import { CLAUDE_MODELS, OPENAI_MODELS } from '@/hooks/useForecastSettings';
import { describeRefreshError } from '@/hooks/useProjections';

interface ForecastSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: 'claude' | 'openai';
  model: string;
  setServiceAndModel: (s: 'claude' | 'openai', m: string) => void;
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
  const [localService, setLocalService] = useState<'claude' | 'openai'>(service);
  const [localModel, setLocalModel] = useState<string>(model);
  const [isApplying, setIsApplying] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
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

  function handleServiceChange(s: 'claude' | 'openai') {
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
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      isDismissable={!isApplying}
      className="modal__backdrop"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
    >
      <Modal.Container className="modal__container max-w-115">
        <Modal.Dialog className="modal__dialog">
          {/* HeroUI renders the dialog in a portal outside the `.prowl`
                subtree, so the design-system token aliases and `.prowl .*`
                class rules are otherwise lost. Re-scope them here, overriding
                the `.prowl` base rule's full-page background / min-height. */}
          <div className="prowl" style={{ minHeight: 0, background: 'transparent' }}>
            <div
              className="card"
              style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}
            >
              {/* Header */}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span className="card-title" style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>
                  <span className="marker" />
                  AI forecast settings
                </span>
                <Modal.CloseTrigger
                  className="btn-ghost"
                  aria-label="Close settings"
                  style={{
                    fontSize: 'var(--fs-lg)',
                    lineHeight: 1,
                    padding: 'var(--sp-0) var(--sp-2)',
                    opacity: isApplying ? 0.4 : 1,
                    pointerEvents: isApplying ? 'none' : 'auto',
                  }}
                />
              </div>

              {/* Section 1: AI Provider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <span
                  className="muted small"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--ls-label)',
                    fontSize: 'var(--fs-xs)',
                  }}
                >
                  AI provider
                </span>
                <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                  {(['claude', 'openai'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleServiceChange(s)}
                      style={{
                        flex: 1,
                        padding: 'var(--sp-3) var(--sp-4)',
                        borderRadius: 'var(--radius)',
                        border:
                          localService === s
                            ? '1.5px solid var(--color-selected)'
                            : '1.5px solid var(--surface-3)',
                        background:
                          localService === s ? 'var(--color-selected-softer)' : 'var(--surface-2)',
                        color: localService === s ? 'var(--color-selected)' : 'var(--text-2)',
                        fontWeight: localService === s ? 600 : 400,
                        fontSize: 'var(--fs-sm)',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <span
                  className="muted small"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--ls-label)',
                    fontSize: 'var(--fs-xs)',
                  }}
                >
                  Model
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                  {activeModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      style={{
                        padding: 'var(--sp-2) var(--sp-4)',
                        borderRadius: 'var(--radius-pill)',
                        border:
                          localModel === m.id
                            ? '1.5px solid var(--color-selected)'
                            : '1.5px solid var(--surface-3)',
                        background:
                          localModel === m.id ? 'var(--color-selected-softer)' : 'var(--surface-2)',
                        color: localModel === m.id ? 'var(--color-selected)' : 'var(--text-2)',
                        fontWeight: localModel === m.id ? 600 : 400,
                        fontSize: 'var(--fs-sm)',
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
                  padding: 'var(--sp-3) 0',
                  borderRadius: 'var(--radius)',
                  background: isApplying ? 'var(--surface-3)' : 'var(--color-selected-soft)',
                  border: '1.5px solid var(--color-selected)',
                  color: 'var(--color-selected)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-sm)',
                  cursor: isApplying ? 'not-allowed' : 'pointer',
                  opacity: isApplying ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {isApplying ? 'Applying…' : 'Apply & refresh'}
              </button>
              {applyError && (
                <span
                  style={{
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--red)',
                    textAlign: 'center',
                    marginTop: -8,
                  }}
                >
                  {applyError}
                </span>
              )}

              {/* Section 3: Saved Forecasts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <span
                  className="muted small"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--ls-label)',
                    fontSize: 'var(--fs-xs)',
                  }}
                >
                  Saved forecasts
                </span>
                {snapshots.length === 0 ? (
                  <span className="muted small" style={{ fontSize: 'var(--fs-sm)' }}>
                    No saved forecasts yet
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--surface-3)',
                          borderRadius: 'var(--radius)',
                          padding: 'var(--sp-3) var(--sp-3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sp-3)',
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
                                border: '1px solid var(--color-selected)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text)',
                                fontSize: 'var(--fs-lg)',
                                padding: 'var(--sp-1) var(--sp-2)',
                                outline: 'none',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setRenamingId(snap.id);
                                setRenameValue(snap.name);
                              }}
                              title="Click to rename"
                              style={{
                                fontSize: 'var(--fs-sm)',
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
                          <span className="muted small" style={{ fontSize: 'var(--fs-xs)' }}>
                            {snap.service} · {snap.model} ·{' '}
                            {new Date(snap.savedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 'var(--fs-xs)',
                            fontWeight: 600,
                            padding: 'var(--sp-0) var(--sp-2)',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--surface-3)',
                            color: 'var(--text-2)',
                            flexShrink: 0,
                          }}
                        >
                          {snap.coin}
                        </span>
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            onLoadSnapshot(snap.id);
                            onClose();
                          }}
                          style={{ fontSize: 'var(--fs-sm)', padding: 'var(--sp-1) var(--sp-3)', flexShrink: 0 }}
                        >
                          Load
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => void onRemoveSnapshot(snap.id)}
                          aria-label={`Delete snapshot ${snap.name}`}
                          style={{
                            fontSize: 'var(--fs-sm)',
                            padding: 'var(--sp-0) var(--sp-2)',
                            flexShrink: 0,
                            color: 'var(--text-2)',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
