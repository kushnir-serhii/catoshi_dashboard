'use client';

import { Modal as HeroModal } from '@heroui/react';
import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

import { buttonVariants } from './Button';
import { Card } from './Card';
import { CardTitle } from './CardTitle';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  /** aria-label for the close (x) button. */
  closeLabel: string;
  children: ReactNode;
  /** Backdrop click / Esc closes. Default true. */
  dismissable?: boolean;
  /** Dim and disable the close button (e.g. while applying). */
  closeDisabled?: boolean;
  /** Gap between sections inside the card: 4 = 16px, 5 = 24px (default). */
  gap?: 4 | 5;
  className?: string;
}

/** Dialog shell: HeroUI backdrop + container + dialog around a `Card` with a titled header. */
export function Modal({
  isOpen,
  onClose,
  title,
  closeLabel,
  children,
  dismissable = true,
  closeDisabled = false,
  gap = 5,
  className,
}: ModalProps) {
  return (
    <HeroModal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable={dismissable}
      className="fixed inset-0 z-(--z-modal) flex h-dvh w-full items-center justify-center bg-[rgba(0,0,0,0.65)] backdrop-blur-[3px] data-[entering=true]:animate-[heroui-fade-in_var(--dur-fast)_ease-out] data-[exiting=true]:animate-[heroui-fade-out_var(--dur-instant)_ease-out]"
    >
      <HeroModal.Container className="pointer-events-none flex w-full max-w-115 flex-col items-center p-4 data-[entering=true]:animate-[heroui-slide-up_var(--dur-base)_var(--ease-out)] data-[exiting=true]:animate-[heroui-slide-down_var(--dur-instant)_ease-out]">
        <HeroModal.Dialog className="pointer-events-auto relative w-full outline-none">
          {/* HeroUI portals the dialog outside the `.prowl` subtree; re-scope it so
              legacy `.prowl .*` rules and token aliases still apply to children. */}
          <div className="prowl min-h-0! bg-transparent!">
            <Card className={cn('flex flex-col p-5', gap === 5 ? 'gap-5' : 'gap-4', className)}>
              <div className="flex items-center justify-between">
                <CardTitle marker="violet" className="text-lg font-semibold">
                  {title}
                </CardTitle>
                <HeroModal.CloseTrigger
                  aria-label={closeLabel}
                  className={buttonVariants({
                    variant: 'icon',
                    className: closeDisabled ? 'pointer-events-none opacity-40' : undefined,
                  })}
                />
              </div>
              {children}
            </Card>
          </div>
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}
