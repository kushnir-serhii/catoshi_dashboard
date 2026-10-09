'use client';

import { useCallback, useEffect, useState } from 'react';

import { CoinSelect, Modal, Muted } from '@/components/ui';
import { WATCHLIST_MAX_COINS } from '@/consts/prices';
import type { CoinListItem } from '@/data/types';
import type { WatchlistCoin } from '@/hooks/useWatchlist';

import { ModalSection } from '../ModalSection';
import { WatchlistCoinRow } from './WatchlistCoinRow';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage watchlist"
      closeLabel="Close watchlist manager"
      gap={5}
    >
      <ModalSection label="Add a coin">
        {isFull ? (
          <Muted>
            Watchlist is full ({WATCHLIST_MAX_COINS} coins max). Remove one to add another.
          </Muted>
        ) : (
          <CoinSelect
            value={PICKER_PLACEHOLDER}
            onChange={handlePick}
            placeholder="Search coin to add…"
          />
        )}
        {note && <Muted>{note}</Muted>}
      </ModalSection>

      <ModalSection label={`On your watchlist (${coins.length})`}>
        {coins.length === 0 ? (
          <Muted>No coins yet — add one above.</Muted>
        ) : (
          <div className="flex flex-col gap-2">
            {coins.map((coin) => (
              <WatchlistCoinRow
                key={coin.id}
                coin={coin}
                onRemove={(id) => {
                  remove(id);
                  setNote(null);
                }}
              />
            ))}
          </div>
        )}
      </ModalSection>
    </Modal>
  );
}
