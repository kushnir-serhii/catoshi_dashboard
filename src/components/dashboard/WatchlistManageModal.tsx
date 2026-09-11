'use client';

import { Modal } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { CoinSelect } from '@/components/ui/CoinSelect';
import { WATCHLIST_MAX_COINS } from '@/consts/prices';
import type { CoinListItem } from '@/data/types';
import type { WatchlistCoin } from '@/hooks/useWatchlist';

interface WatchlistManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: WatchlistCoin[];
  add: (coin: WatchlistCoin) => void;
  remove: (id: string) => void;
  isFull: boolean;
}

const PICKER_PLACEHOLDER: CoinListItem = { id: '', symbol: '', name: 'Add a coin…' };

export function WatchlistManageModal({
  isOpen,
  onClose,
  coins,
  add,
  remove,
  isFull,
}: WatchlistManageModalProps) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setNote(null);
  }, [isOpen]);

  const handlePick = useCallback(
    (coin: CoinListItem) => {
      if (!coin.id) return;
      if (coins.some((c) => c.id === coin.id)) {
        setNote(`${coin.symbol.toUpperCase()} is already on your watchlist.`);
        return;
      }
      add({ id: coin.id, symbol: coin.symbol, name: coin.name });
      setNote(null);
    },
    [add, coins],
  );

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="modal__backdrop"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
    >
      <Modal.Container className="modal__container max-w-115">
        <Modal.Dialog className="modal__dialog">
          {/* HeroUI portals the dialog outside the `.prowl` subtree, so the
              design-system token aliases and `.prowl .*` rules must be
              re-scoped here (see ForecastSettingsModal). */}
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
                  Manage watchlist
                </span>
                <Modal.CloseTrigger
                  className="btn-ghost"
                  aria-label="Close watchlist manager"
                  style={{ fontSize: 'var(--fs-lg)', lineHeight: 1, padding: 'var(--sp-0) var(--sp-2)' }}
                />
              </div>

              {/* Add a coin */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <span
                  className="muted small"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--ls-label)',
                    fontSize: 'var(--fs-xs)',
                  }}
                >
                  Add a coin
                </span>
                {isFull ? (
                  <span className="muted small" style={{ fontSize: 'var(--fs-sm)' }}>
                    Watchlist is full ({WATCHLIST_MAX_COINS} coins max). Remove one to add another.
                  </span>
                ) : (
                  <CoinSelect
                    value={PICKER_PLACEHOLDER}
                    onChange={handlePick}
                    placeholder="Search coin to add…"
                  />
                )}
                {note && (
                  <span className="muted small" style={{ fontSize: 'var(--fs-sm)' }}>
                    {note}
                  </span>
                )}
              </div>

              {/* Current coins */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <span
                  className="muted small"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--ls-label)',
                    fontSize: 'var(--fs-xs)',
                  }}
                >
                  On your watchlist ({coins.length})
                </span>
                {coins.length === 0 ? (
                  <span className="muted small" style={{ fontSize: 'var(--fs-sm)' }}>
                    No coins yet — add one above.
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    {coins.map((coin) => (
                      <div
                        key={coin.id}
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
                          {coin.symbol.toUpperCase()}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 'var(--fs-sm)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {coin.name}
                        </span>
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            remove(coin.id);
                            setNote(null);
                          }}
                          aria-label={`Remove ${coin.name} from watchlist`}
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
